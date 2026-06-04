// src/lib/audit-logger.ts
// Audit logging לקריאות של נתונים רגישים (סיכומי פגישה, תמלולים, ניתוחים).
//
// המטרה: רישום של "מי קרא מה ומתי" — חובה לפי תקנות הגנת הפרטיות (2017) על
// מידע רפואי-נפשי, וגם דרישה אתית של הפ"י.
//
// M2 (Stage 2.0 hardening): כתיבה כפולה — stdout/Render Logs (כפי שהיה)
// ובמקביל DataAccessAuditLog ב-DB. ה-DB משמש מקור tamper-proof:
//   • אסור UPDATE על השורות (אכיפה ברמת API — אין endpoint למחיקה/עדכון).
//   • cron retention מוחק רק מעל 12 חודשים.
//   • ADMIN רואה דרך /api/admin/audit/data-access.
//
// כשלים: הכתיבה ל-DB אסינכרונית (fire-and-forget) ולא חוסמת את ה-user flow.
// stdout נשאר תמיד — אם DB נופל, יש את הלוג ב-Render.

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/get-client-ip";
import type { NextRequest } from "next/server";

export type AuditRecordType =
  | "SESSION_NOTE"
  | "TRANSCRIPTION"
  | "ANALYSIS"
  | "CLIENT_NOTES"
  | "RECORDING"
  | "CLIENT_PROFILE"
  | "SESSION_DETAIL"
  | "PAYMENT"
  | "DOCUMENT"
  | "CONSENT_FORM"
  | "CLIENT_COMMITMENT"
  // מעקב מנהלת על התכתבויות בין מטפלים (קריאת תוכן פרטי של אנשי צוות).
  | "THERAPIST_CHAT";

export type AuditAction = "READ" | "EXPORT" | "PRINT" | "DELETE" | "UPDATE" | "SIGN";

export interface AuditLogParams {
  /** ID של המשתמש שביצע את הקריאה. null עבור גישה ציבורית-אנונימית
   *  (למשל קבלה דרך קישור public token) — נשמר עם snapshot email/name=null.
   *
   *  Impersonation: ה-userId הוא ה-**effective** (target) — זה ה-data subject
   *  שעל הרשומה שלו ניגשו. ה-OWNER האמיתי שביצע את הקריאה דרך החיזוי נשמר
   *  ב-`impersonatedBy` (ראה למטה). ככה ה-audit מחזיק שני trails במקביל:
   *    • "מה היה ה-data scope של הקריאה?" → userId
   *    • "מי אחראי לקריאה הזו בפועל?" → meta.impersonatedBy
   *  (תאם לדפוס ב-/api/clients/[id]/export-personal-data, החל מ-Phase 2). */
  userId: string | null;
  recordType: AuditRecordType;
  recordId: string;
  action: AuditAction;
  /** אופציונלי: client ID של ה-record (אם רלוונטי, לטראגינג צולב) */
  clientId?: string | null;
  /** אופציונלי: NextRequest ל-IP/user-agent extraction */
  request?: NextRequest;
  /** אופציונלי: metadata נוסף (למשל skip-summary flag, accessSource) */
  meta?: Record<string, unknown>;
  /** Phase 2 — Impersonation: ה-`originalUserId` של ה-OWNER שעשה את ה-START
   *  ושפעולותיו עוברות תחת זהות ה-target. כשמעבירים את זה, נכתב כ-
   *  `meta.impersonatedBy` הן ל-stdout והן ל-DB. אם undefined, הקריאה
   *  נחשבת רגילה (לא במצב impersonation). */
  impersonatedBy?: string | null;
}

/**
 * רישום של קריאה/פעולה על נתון רגיש.
 *
 * הפונקציה לא זורקת חריגים — אם logging נכשל, לא רוצים שזה ישבור את
 * ה-user flow. במקרה כזה רק נרשום warn ל-stderr.
 */
export function logDataAccess(params: AuditLogParams): void {
  try {
    const { userId, recordType, recordId, action, clientId, request, meta, impersonatedBy } =
      params;

    // H10 (סבב אבטחה 14, 2026-05-19): rightmost XFF דרך getClientIp.
    // הקוד הקודם לקח leftmost — IP שתוקף יכול לזייף → audit היה נרשם
    // עם IP מזויף ופוגע ב-forensics. עכשיו: ה-IP ש-Render proxy ראה בפועל.
    const ipAddress = request ? getClientIp(request) : undefined;
    const userAgent = request?.headers.get("user-agent") || undefined;

    // Phase 2: אם זו קריאה במצב impersonation, מטמיעים את ה-OWNER האמיתי
    // ב-meta.impersonatedBy. userId נשאר ה-target (data subject), וה-meta
    // מתעד מי באמת לחץ. הדפוס תאם ל-/api/clients/[id]/export-personal-data.
    const finalMeta: Record<string, unknown> | undefined =
      impersonatedBy
        ? { ...(meta ?? {}), impersonatedBy }
        : meta;

    // Format: [AUDIT] {action} {recordType} — userId={X} recordId={Y} ...
    // זה format שקל לחלץ דרך grep/regex אם צריך לסקור לוגים.
    logger.info(`[AUDIT] ${action} ${recordType}`, {
      audit: true,
      userId,
      recordType,
      recordId,
      action,
      clientId: clientId ?? undefined,
      ipAddress,
      userAgent: userAgent?.substring(0, 200), // limit length
      meta: finalMeta,
      timestamp: new Date().toISOString(),
    });

    // M2: כתיבה ל-DB tamper-proof — fire-and-forget, לא חוסם.
    // נכשל בשקט (רק warn ל-stderr) כדי שלא לשבור את ה-flow של המשתמש.
    void writeAuditToDb({
      userId,
      recordType,
      recordId,
      action,
      clientId,
      ipAddress,
      userAgent,
      meta: finalMeta,
    });
  } catch (err) {
    // אסור שlogging ישבור backend
    try {
      logger.warn("[AUDIT] Failed to log data access", {
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // silent
    }
  }
}

interface DbAuditWriteParams {
  userId: string | null;
  recordType: AuditRecordType;
  recordId: string;
  action: AuditAction;
  clientId?: string | null;
  ipAddress?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
}

// M2: כתיבת ה-audit log ל-DB. אסינכרונית, fire-and-forget.
// כולל snapshot של userEmail/userName — חיוני: גם אחרי מחיקת user,
// יש לדעת מי ביצע את הפעולה (FK הוא SetNull, אבל ה-snapshot מוטמע ברשומה).
async function writeAuditToDb(params: DbAuditWriteParams): Promise<void> {
  try {
    // snapshot של email/name — read-time (ולא ב-trigger) כי snapshot של
    // user שהוסר אינו זמין יותר. כאן ה-user עדיין קיים בעת הקריאה.
    // M10.1: עבור גישה ציבורית-אנונימית (userId=null) — אין user לחפש;
    // הרשומה תיכתב עם email/name=null + meta.accessSource ל-trail.
    const user = params.userId
      ? await prisma.user.findUnique({
          where: { id: params.userId },
          select: { email: true, name: true },
        })
      : null;

    await prisma.dataAccessAuditLog.create({
      data: {
        userId: params.userId,
        userEmail: user?.email ?? null,
        userName: user?.name ?? null,
        recordType: params.recordType,
        recordId: params.recordId,
        action: params.action,
        clientId: params.clientId ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent?.substring(0, 500) ?? null,
        meta: params.meta ? JSON.stringify(params.meta) : null,
      },
    });
  } catch (err) {
    // לא קריטי — יש את ה-stdout log כ-fallback
    logger.warn("[AUDIT] Failed to persist to DB (stdout log preserved)", {
      recordType: params.recordType,
      action: params.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
