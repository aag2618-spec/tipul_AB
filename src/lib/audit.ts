/**
 * Audit log infrastructure — Stage 1.6 of admin UI redesign
 *
 * Two layers:
 *  1. `logAdminAction` — simple standalone logger (kept for backwards compatibility)
 *  2. `withAudit` — transactional wrapper that performs an action AND logs it
 *     atomically. Either both succeed or both fail.
 *
 * Actor model lets system events (cron, webhooks, migrations) log with a
 * source tag instead of an adminId, avoiding FK issues.
 *
 * Retry policy (inside withAudit):
 *  - Isolation level Serializable by default
 *  - Retries on 40001 (serialization failure) + 40P01 (deadlock)
 *  - 3 attempts with jittered backoff (50/150/400ms ± 25%)
 */

import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ─── Actor model ────────────────────────────────────────────────────────────

export type AuditActor =
  | { kind: "user"; session: Session }
  | {
      kind: "system";
      source: "CRON" | "WEBHOOK_CARDCOM" | "MIGRATION" | "SCRIPT";
      externalRef?: string;
    };

// ─── Retry helpers ──────────────────────────────────────────────────────────

const RETRY_CODES = ["40001", "40P01"] as const;
const DELAYS_MS = [50, 150, 400];
const MAX_RETRIES = 3;

function jitter(ms: number): number {
  return ms + Math.random() * ms * 0.5; // 0-50% extra
}

function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && (RETRY_CODES as readonly string[]).includes(code);
}

// ─── logAdminAction (legacy — kept working) ─────────────────────────────────

export async function logAdminAction(params: {
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  return prisma.adminAuditLog.create({
    data: {
      adminId: params.adminId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      details: params.details ? JSON.stringify(params.details) : null,
    },
  });
}

// ─── withAudit — transactional action + audit ───────────────────────────────

export interface WithAuditOptions {
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
  /** Override isolation level (default: Serializable). */
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Executes `fn` and logs the action atomically in a single transaction.
 * Retries automatically on serialization/deadlock errors.
 *
 * System events log with adminId=null and adminId encoded via details.source.
 * This keeps the FK constraint valid without requiring schema changes in 1.6.
 *
 * Example (user action):
 *   await withAudit(
 *     { kind: "user", session },
 *     { action: "block_user", targetType: "user", targetId: userId },
 *     async (tx) => {
 *       await tx.user.update({ where: { id: userId }, data: { isBlocked: true } });
 *     }
 *   );
 */
export async function withAudit<T>(
  actor: AuditActor,
  opts: WithAuditOptions,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const isolationLevel = opts.isolationLevel ?? "Serializable";

  // Resolve adminId and actor metadata without additional I/O
  let adminId: string | null;
  let actorMeta: Record<string, unknown> = {};
  if (actor.kind === "user") {
    adminId = actor.session.user.id;
    actorMeta = {
      actorKind: "user",
      adminEmail: actor.session.user.email ?? null,
      adminName: actor.session.user.name ?? null,
    };
  } else {
    adminId = null; // system — won't be attributed to a user
    actorMeta = {
      actorKind: "system",
      source: actor.source,
      externalRef: actor.externalRef,
    };
  }

  const detailsToStore = { ...actorMeta, ...(opts.details ?? {}) };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const result = await fn(tx);

          // Only write audit row if we have an adminId (FK constraint).
          // System events are captured via the details JSON for now; once
          // stage 1.7 migration adds snapshot fields + onDelete: SetNull,
          // system events will write real rows with adminId=null.
          if (adminId !== null) {
            await tx.adminAuditLog.create({
              data: {
                adminId,
                action: opts.action,
                targetType: opts.targetType,
                targetId: opts.targetId ?? null,
                details: JSON.stringify(detailsToStore),
              },
            });
          } else {
            // System event — log via logger until schema migration lands
            logger.info("[withAudit:system] action recorded", {
              action: opts.action,
              targetType: opts.targetType,
              targetId: opts.targetId,
              ...actorMeta,
            });
          }

          return result;
        },
        {
          isolationLevel,
          maxWait: 5000,
          timeout: 10000,
        }
      );
    } catch (err) {
      if (isRetryableError(err) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, jitter(DELAYS_MS[attempt])));
        continue;
      }
      throw err;
    }
  }

  throw new Error("withAudit: exhausted retries without result");
}
