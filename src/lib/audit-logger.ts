// src/lib/audit-logger.ts
// Audit logging לקריאות של נתונים רגישים (סיכומי פגישה, תמלולים, ניתוחים).
//
// המטרה: רישום של "מי קרא מה ומתי" — חובה לפי תקציב 13 (2025) על
// מידע רפואי-נפשי, וגם דרישה אתית של הפ"י.
//
// הגישה הנוכחית: logger-based (כותב ל-stdout/stderr שמסונכרנים ל-Render
// Logs). אפשר לקרוא את הלוגים דרך Render Dashboard → Logs.
//
// בעתיד (Phase 6 מורחב): לעבור ל-DB-backed audit log עם AuditLog model.
// זה ידרוש Prisma migration שלא בטוח להריץ בלי backup. נחזור לזה אחרי
// שיהיה backup רשמי.

import { logger } from "@/lib/logger";
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
  | "DOCUMENT";

export type AuditAction = "READ" | "EXPORT" | "PRINT" | "DELETE" | "UPDATE";

export interface AuditLogParams {
  userId: string;
  recordType: AuditRecordType;
  recordId: string;
  action: AuditAction;
  /** אופציונלי: client ID של ה-record (אם רלוונטי, לטראגינג צולב) */
  clientId?: string | null;
  /** אופציונלי: NextRequest ל-IP/user-agent extraction */
  request?: NextRequest;
  /** אופציונלי: metadata נוסף (למשל skip-summary flag) */
  meta?: Record<string, unknown>;
}

/**
 * רישום של קריאה/פעולה על נתון רגיש.
 *
 * הפונקציה לא זורקת חריגים — אם logging נכשל, לא רוצים שזה ישבור את
 * ה-user flow. במקרה כזה רק נרשום warn ל-stderr.
 */
export function logDataAccess(params: AuditLogParams): void {
  try {
    const { userId, recordType, recordId, action, clientId, request, meta } =
      params;

    const ipAddress =
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request?.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request?.headers.get("user-agent") || undefined;

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
      meta,
      timestamp: new Date().toISOString(),
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
