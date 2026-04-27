// src/lib/cardcom/webhook-claim.ts
// Lease-based webhook idempotency claim.
//
// Why not just `processed=true` set BEFORE processing?
//   If the worker crashes (OOM, deploy, timeout) between claim and finish,
//   the row stays processed=true forever and the next Cardcom retry skips it.
//   The transaction would be lost.
//
// Strategy:
//   - Claim: set claimedAt=now if (claimedAt is null OR claimedAt < now - LEASE)
//            AND processed=false. Use updateMany with count check (atomic).
//   - On success: set processed=true, processedAt=now (release lease implicit).
//   - On failure: clear claimedAt so a retry can re-claim.
//   - On crash: claimedAt stays old; after LEASE_MS the next retry takes over.

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

/** Lease window — workers can re-claim if a previous claim is older than this. */
const WEBHOOK_LEASE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Strip any credential-shaped keys from a webhook payload before persisting.
 * Cardcom should never echo our own ApiPassword/ApiName back, but defense in
 * depth: if a future API change starts including them, our DB stays clean.
 */
function sanitizePayload(payload: object): object {
  const SENSITIVE_KEYS = ["ApiPassword", "ApiName", "ApiKey", "Password"];
  const cloned: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  for (const key of SENSITIVE_KEYS) {
    if (key in cloned) delete cloned[key];
  }
  return cloned;
}

export interface ClaimResult {
  status: "claimed" | "already_processed" | "in_progress";
  eventId: string;
}

/**
 * Try to claim a webhook event for processing. Idempotent across retries:
 *   - First call: claims and returns "claimed".
 *   - Same call after success: returns "already_processed".
 *   - Same call while another worker still holds the lease: "in_progress".
 *   - Same call after a crash (lease expired): re-claims (returns "claimed").
 */
export async function claimWebhook(
  provider: string,
  externalId: string,
  rawPayload: object
): Promise<ClaimResult> {
  const now = new Date();
  const leaseCutoff = new Date(now.getTime() - WEBHOOK_LEASE_MS);

  // Upsert keeps the row across retries. Payload is sanitized before storage.
  const event = await prisma.webhookEvent.upsert({
    where: { provider_externalId: { provider, externalId } },
    update: { attempts: { increment: 1 } },
    create: { provider, externalId, rawPayload: sanitizePayload(rawPayload) },
  });

  if (event.processed) {
    return { status: "already_processed", eventId: event.id };
  }

  // Atomic claim: only one worker wins. We require:
  //  - same id we just upserted (don't claim a different row)
  //  - processed still false
  //  - claimedAt is null OR older than lease cutoff
  const claim = await prisma.webhookEvent.updateMany({
    where: {
      id: event.id,
      processed: false,
      OR: [{ claimedAt: null }, { claimedAt: { lt: leaseCutoff } }],
    },
    data: { claimedAt: now },
  });

  if (claim.count === 0) {
    return { status: "in_progress", eventId: event.id };
  }
  return { status: "claimed", eventId: event.id };
}

/** Mark the event as fully processed. */
export async function finalizeWebhook(eventId: string): Promise<void> {
  await prisma.webhookEvent.updateMany({
    where: { id: eventId, processed: false },
    data: { processed: true, processedAt: new Date(), error: null },
  });
}

/**
 * Release the claim so a future retry can re-process. Best-effort —
 * if this DB write fails, the lease will still expire after WEBHOOK_LEASE_MS.
 * Failures are logged so we have visibility into recurring DB issues.
 */
export async function releaseWebhookClaim(
  eventId: string,
  errorMessage: string
): Promise<void> {
  try {
    await prisma.webhookEvent.updateMany({
      where: { id: eventId, processed: false },
      data: { claimedAt: null, error: errorMessage },
    });
  } catch (err) {
    logger.warn("[webhook-claim] releaseWebhookClaim failed (lease will expire)", {
      eventId,
      releaseError: err instanceof Error ? err.message : String(err),
      originalError: errorMessage,
    });
  }
}
