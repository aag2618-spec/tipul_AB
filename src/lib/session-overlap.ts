// M5/M11: גילוי חפיפת פגישות ברמת הקליניקה (cross-therapist).
//
// הבעיה: בקליניקה רב-מטפלית, שני מטפלים יכולים לקבוע פגישות באותה שעה
// באותו מיקום (חדר משותף). בדיקת ה-conflict הקיימת ב-/api/sessions/route.ts
// מסננת רק לפי therapistId — ולכן לא תופסת התנגשות בין מטפלים.
//
// הפתרון: כשפגישה נשמרת עם `location` ויש organizationId, לבדוק חפיפה
// ברמת הארגון (כל המטפלים) עם אותו location (case-insensitive). אם
// השדה location ריק — אין בדיקה (מצב דיגיטלי / מטפלים עצמאיים).
//
// trade-off ידוע: הוא string-based, לא roomId. בעתיד עם migration ל-roomId
// (מאוחר יותר, דורש תיאום עם פיצ'ר ניהול חדרים) — נחליף את ה-where כאן.

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface ClinicLocationConflictParams {
  organizationId: string | null;
  location: string | null | undefined;
  startTime: Date;
  endTime: Date;
  /** מזהה הפגישה הנוכחית (PUT) — לא להחזיר את עצמה כקונפליקט. */
  excludeSessionId?: string | null;
}

export interface ClinicLocationConflict {
  id: string;
  startTime: Date;
  endTime: Date;
  location: string | null;
  therapistName: string | null;
  clientName: string | null;
  type: string;
}

/**
 * מחזיר conflict בקליניקה אם פגישה חופפת בזמן עם פגישה אחרת באותו location
 * באותו organization, של מטפל אחר באותה קליניקה. מחזיר null אם:
 *   • אין organizationId (מטפל עצמאי) — בדיקה per-therapist כבר מספיקה.
 *   • אין location — לא ידוע אם זה חדר משותף.
 */
export async function findClinicLocationConflict(
  params: ClinicLocationConflictParams
): Promise<ClinicLocationConflict | null> {
  const { organizationId, location, startTime, endTime, excludeSessionId } = params;

  if (!organizationId) return null;
  const normalized = (location ?? "").trim();
  if (normalized.length === 0) return null;

  try {
    const conflict = await prisma.therapySession.findFirst({
      where: {
        organizationId,
        // case-insensitive match על location. PostgreSQL ילך ל-ILIKE עם `mode`.
        location: { equals: normalized, mode: "insensitive" },
        status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
        OR: [
          { AND: [{ startTime: { lte: startTime } }, { endTime: { gt: startTime } }] },
          { AND: [{ startTime: { lt: endTime } }, { endTime: { gte: endTime } }] },
          { AND: [{ startTime: { gte: startTime } }, { endTime: { lte: endTime } }] },
        ],
      },
      include: {
        therapist: { select: { name: true } },
        client: { select: { name: true } },
      },
    });
    if (!conflict) return null;
    return {
      id: conflict.id,
      startTime: conflict.startTime,
      endTime: conflict.endTime,
      location: conflict.location,
      therapistName: conflict.therapist?.name ?? null,
      clientName: conflict.client?.name ?? null,
      type: conflict.type,
    };
  } catch (err) {
    // לוג אבל לא חוסם — overlap הוא second layer, לא first.
    logger.error("[session-overlap] findClinicLocationConflict failed", {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
    });
    return null;
  }
}

/** הודעת שגיאה אחידה בעברית עבור conflict ברמת הקליניקה. */
export function buildClinicConflictMessage(
  conflict: ClinicLocationConflict
): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  const who = conflict.therapistName ?? "מטפל/ת";
  const clientPart = conflict.clientName ? ` עם ${conflict.clientName}` : "";
  return `חפיפה במיקום "${conflict.location ?? ""}": ${who}${clientPart} בשעה ${fmt(conflict.startTime)}-${fmt(conflict.endTime)}`;
}
