// src/app/api/p/transaction-status/route.ts
// Public, no-auth endpoint that returns ONLY the status of a CardcomTransaction.
// Used by the /p/thanks page to poll until the webhook flips PENDING → APPROVED.
//
// SECURITY:
//  - Returns just `{ status }` — no amount, no approval number, no PII.
//  - Transaction id is a cuid (~10^36) so guessing is hard, but URL leakage
//    (referrers, screenshots) is realistic and the response must be useless
//    to anyone except the polling page.
//  - Rate-limited per IP (60/min) to bound abuse cost. The thanks page polls
//    at most ~20 times in 60s, so 60/min is generous for legit clients.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveClientIp } from "@/lib/cardcom/verify-webhook";
import { syncCardcomTransaction } from "@/lib/cardcom/sync-cardcom-payment";

export const dynamic = "force-dynamic";

// Auto-sync window: if the transaction has been PENDING this long, the next
// poll will trigger a server-side GetLpResult before responding. Cardcom's
// webhook usually arrives within 1-5s; 15s is a comfortable buffer that
// protects against missed/delayed webhooks (especially on sandbox terminal
// 1000 which doesn't reliably deliver them).
const AUTO_SYNC_THRESHOLD_MS = 15_000;

export async function GET(request: NextRequest) {
  const ip = resolveClientIp(request.headers);
  // ⚠️ Per-instance + per-IP cap. Bounds DB cost from a single attacker; not
  // a real DoS shield (multi-instance or distributed sources scale around it).
  const limit = checkRateLimit(`p:transaction-status:${ip ?? "unknown"}`, {
    windowMs: 60 * 1000,
    maxRequests: 60,
  });
  if (!limit.allowed) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(
          Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))
        ),
      },
    });
  }

  const t = new URL(request.url).searchParams.get("t");
  if (!t || !/^[A-Za-z0-9_-]{1,64}$/.test(t)) {
    return NextResponse.json({ status: "unknown" }, { status: 400 });
  }

  // On a transient DB error report "unknown" rather than 500 — the polling
  // page will simply retry, and the user keeps waiting on the thanks screen.
  // Crashing here would surface a confusing error after a successful payment.
  try {
    const tx = await prisma.cardcomTransaction.findUnique({
      where: { id: t },
      select: { status: true, createdAt: true },
    });
    if (!tx) {
      return NextResponse.json({ status: "unknown" });
    }
    // Time-window guard: the legitimate /p/thanks polling happens within
    // minutes of payment. After 24h the transaction id is no longer relevant
    // for live polling — narrow the leakage window if a URL leaks via referrer
    // or screenshot.
    const ageMs = Date.now() - tx.createdAt.getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      return NextResponse.json({ status: "unknown" });
    }

    // Auto-sync for PENDING transactions older than the threshold. Cardcom's
    // webhook should have arrived by now; if it hasn't (sandbox or delayed),
    // we fetch canonical state ourselves so the polling caller sees APPROVED
    // without needing the user to click "סנכרן" manually. syncCardcomTransaction
    // is idempotent and bounded — at most one Cardcom call per poll cycle.
    if (tx.status === "PENDING" && ageMs > AUTO_SYNC_THRESHOLD_MS) {
      try {
        const result = await syncCardcomTransaction(t);
        // Use the freshly-synced status as the response — saves the client
        // an extra polling round-trip.
        return NextResponse.json({ status: result.status });
      } catch (err) {
        // Sync failure is not fatal — fall through to returning the stored
        // status. The caller will keep polling and we'll retry next cycle.
        logger.warn("[p/transaction-status] auto-sync failed", {
          tIdPrefix: t.slice(0, 8),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ status: tx.status });
  } catch (err) {
    logger.warn("[p/transaction-status] DB lookup failed", {
      tIdPrefix: t.slice(0, 8),
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ status: "unknown" });
  }
}
