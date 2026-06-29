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
 *  - Retries on 40001 (serialization failure) + 40P01 (deadlock),
 *    and P2034 (Prisma wraps the conflict inside $transaction as P2034,
 *    not the raw Postgres code)
 *  - 3 attempts with jittered backoff (50/150/400ms ± 25%)
 */

import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { alertAuditWriteFailure } from "@/lib/audit-failure-alert";

// ─── Actor model ────────────────────────────────────────────────────────────

export type AuditActor =
  | { kind: "user"; session: Session }
  | {
      kind: "system";
      source: "CRON" | "WEBHOOK_CARDCOM" | "MIGRATION" | "SCRIPT";
      externalRef?: string;
    };

// ─── Retry helpers ──────────────────────────────────────────────────────────

const RETRY_CODES = ["40001", "40P01", "P2034"] as const;
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

  // Resolve adminId and actor metadata without additional I/O.
  // Stage 1.7 schema: adminId nullable + onDelete SetNull + adminEmail/adminName
  // snapshot columns → system events (CRON/WEBHOOK) כותבים ל-DB עם adminId=null
  // + source ב-details; רישום פעולות שהתבצעו על ידי אדמין שנמחק בהמשך נשמר
  // (adminId יהפוך ל-null, snapshot נשאר).
  let adminId: string | null;
  let adminEmail: string | null;
  let adminName: string | null;
  let actorMeta: Record<string, unknown> = {};
  if (actor.kind === "user") {
    // Impersonation: בעת ש-OWNER מתחזה ל-target, ה-session.user.id הוא של
    // ה-target (כדי לזרום data scope טבעי). אבל ב-audit, אחריות הפעולה
    // היא של ה-OWNER — ולכן adminId נרשם כ-OWNER (originalUserId), עם
    // metadata שמתעד שהפעולה בוצעה תחת impersonation של target ספציפי.
    // ככה queries "מי עשה X?" תמיד מחזירות את האדם שאחראי באמת.
    const actingAs = actor.session.user.actingAs;
    const isImpersonating = !!actingAs;
    if (isImpersonating && actor.session.user.originalUserId) {
      adminId = actor.session.user.originalUserId;
      adminEmail = actor.session.user.email ?? null; // OWNER's email (לא הוחלף ב-session)
      adminName = `${actor.session.user.name ?? "—"} (impersonating)`;
      actorMeta = {
        actorKind: "user",
        impersonation: {
          impersonatorId: actor.session.user.originalUserId,
          impersonationSessionId: actingAs!.sessionId,
          targetUserId: actingAs!.userId,
          targetName: actingAs!.name,
        },
      };
    } else {
      adminId = actor.session.user.id;
      adminEmail = actor.session.user.email ?? null;
      adminName = actor.session.user.name ?? null;
      actorMeta = { actorKind: "user" };
    }
  } else {
    adminId = null;
    adminEmail = null;
    adminName = `[SYSTEM:${actor.source}]`;
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

          await tx.adminAuditLog.create({
            data: {
              adminId,
              adminEmail,
              adminName,
              action: opts.action,
              targetType: opts.targetType,
              targetId: opts.targetId ?? null,
              details: JSON.stringify(detailsToStore),
            },
          });

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

// ─── logDelegatedCreate — מעקב יצירה בשם מטפל אחר ───────────────────────────
//
// Phase 2 (2026-05-26): כש-OWNER/SECRETARY יוצרים רשומה ש"שייכת" למטפל אחר
// בקליניקה (לקוח/פגישה/התחייבות/מסמך/טופס הסכמה), חשוב שלבעלת הקליניקה
// יהיה trail של "מי יצר מה לטובת מי". זה לא הוצאת ADMIN audit במלוא המובן
// (לא מתעד מנהלי מערכת) אבל משתמש באותו טבלה לטובת שאילתות "מי פעל בשם
// מי" בדשבורד הקליניקה.
//
// **best-effort** — לא חוסם את ה-flow אם הכתיבה נכשלה. ה-create כבר הצליח
// בנקודה שזה נקרא, ואם ה-audit נכשל מקבלים warn ב-stderr. למקרים שדורשים
// אטומיות מלאה (admin operations, billing) השתמש ב-withAudit.

export type DelegatedRecordType =
  | "CLIENT"
  | "SESSION"
  | "COMMITMENT"
  | "DOCUMENT"
  | "CONSENT_FORM"
  | "ATTACHMENT";

export async function logDelegatedCreate(params: {
  /**
   * המבצע ה-effective — ה-`userId` מתוך `requireAuth()`. במצב impersonation
   * זהו ה-target (המתחזה כ-), בדומה לדפוס של `logDataAccess`. הזהות של
   * ה-actor האמיתי (OWNER) נשמרת בנפרד דרך `impersonatedBy`.
   */
  operatorId: string;
  /** המטפל שהרשומה נכתבה תחתיו (=`finalTherapistId`). */
  targetTherapistId: string;
  /** סוג הרשומה — נכתב כ-targetType ב-audit (lowercase). */
  recordType: DelegatedRecordType;
  /** ID של הרשומה שזה עתה נוצרה. */
  recordId: string;
  /** Org ID — נשמר ב-details לטובת שאילתות per-clinic. */
  organizationId?: string | null;
  /** clientId אופציונלי (לסשנים/sub-records) — לטראגינג צולב ב-DSAR. */
  clientId?: string | null;
  /**
   * `originalUserId` כש-`isImpersonating=true`. כשמסופק, נשמר ב-details
   * כדי שיהיה אפשר לזהות את ה-OWNER שהיה מאחורי ההתחזות. תואם לדפוס
   * `impersonatedBy` ב-`logDataAccess`.
   */
  impersonatedBy?: string | null;
}): Promise<void> {
  // אם המבצע = היעד **ואין impersonation**, אין delegation. לא רושמים כדי לא
  // להציף את הלוג. במקרה של impersonation אנחנו תמיד רוצים לתעד — גם אם
  // המתחזה אליו במקרה הוא גם המטפל היעד.
  if (params.operatorId === params.targetTherapistId && !params.impersonatedBy) {
    return;
  }

  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: params.operatorId,
        action: "delegated_create",
        targetType: params.recordType.toLowerCase(),
        targetId: params.recordId,
        details: JSON.stringify({
          targetTherapistId: params.targetTherapistId,
          organizationId: params.organizationId ?? null,
          clientId: params.clientId ?? null,
          recordType: params.recordType,
          ...(params.impersonatedBy ? { impersonatedBy: params.impersonatedBy } : {}),
        }),
      },
    });
  } catch (err) {
    // לא קריטי ל-flow — ה-create כבר הצליח. מתעדים warn ל-stderr, ובנוסף מדליקים
    // AdminAlert (deduped) כי גם זה trail של "מי פעל בשם מי" שאסור שייעלם בשקט.
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("[delegated-create-audit] persist failed", {
      operatorId: params.operatorId,
      targetTherapistId: params.targetTherapistId,
      recordType: params.recordType,
      recordId: params.recordId,
      error: message,
    });
    alertAuditWriteFailure("delegated-create (AdminAuditLog)", message);
  }
}
