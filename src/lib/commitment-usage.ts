import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * מקור אמת יחיד לספירת ניצול התחייבות קופ"ח + שיוך אמיתי פגישה→התחייבות.
 * נקראת מ**שני** מסלולי שינוי סטטוס הפגישה כדי שלא ייפתח פער ספירה:
 *   • PUT  /api/sessions/[id]        (השלמה עם חיוב/השתתפות עצמית)
 *   • PATCH /api/sessions/[id]/status (השלמה "ללא חיוב" / שינוי סטטוס מהיר)
 *
 * מודל: פגישה אחת שמסתיימת מנצלת יחידה אחת מהתחייבות **אחת** בלבד.
 *  - מעבר ל-COMPLETED: בוחר את ההתחייבות הפעילה **החדשה ביותר** (עקבי עם בחירת
 *    ההשתתפות העצמית ב-PUT, orderBy createdAt desc), מקדם את usedSessions אטומית
 *    עם guard תקרה (כך ששתי פגישות בו-זמנית לא יחרגו מהמכסה), ורק אם הניצול
 *    בוצע בפועל (count === 1) שומר את commitmentId על הפגישה.
 *  - יציאה מ-COMPLETED (לפגישה שהיתה מקושרת): מפחית את המונה (לא יורד מ-0)
 *    ומנקה את commitmentId — כך שהמונה והשיוך נשארים עקביים תמיד.
 *
 * לא זורק: כשל DB נרשם ללוג בלבד, כדי שלא יפיל את עדכון הסטטוס עצמו.
 */
export async function applyCommitmentUsageOnStatusChange(params: {
  sessionId: string;
  clientId: string | null;
  previousStatus: string;
  newStatus: string | undefined;
  existingCommitmentId: string | null;
}): Promise<void> {
  const { sessionId, clientId, previousStatus, newStatus, existingCommitmentId } =
    params;
  if (!clientId) return;

  const becameCompleted =
    newStatus === "COMPLETED" && previousStatus !== "COMPLETED";
  const leftCompleted =
    previousStatus === "COMPLETED" &&
    newStatus !== undefined &&
    newStatus !== "COMPLETED";

  if (becameCompleted) {
    try {
      // התחייבות יעד: הפעילה החדשה ביותר (אותה רשומה שבה משתמשת בחירת
      // ההשתתפות העצמית) — כך החיוב והספירה תמיד מתייחסים לאותה התחייבות.
      const target = await prisma.clientCommitment.findFirst({
        where: { clientId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (target) {
        // עדכון אטומי מוגן-תקרה: התנאי usedSessions < approvedSessions מוערך על
        // העמודה בזמן ה-UPDATE. אם המכסה כבר מוצתה — count=0, לא נספר ולא נקשר.
        const updated = await prisma.clientCommitment.updateMany({
          where: {
            id: target.id,
            status: "ACTIVE",
            OR: [
              { approvedSessions: null },
              { usedSessions: { lt: prisma.clientCommitment.fields.approvedSessions } },
            ],
          },
          data: { usedSessions: { increment: 1 } },
        });
        if (updated.count === 1) {
          await prisma.therapySession.update({
            where: { id: sessionId },
            data: { commitmentId: target.id },
          });
        }
      }
    } catch (err) {
      logger.error("[commitment-usage] increment failed", {
        sessionId,
        clientId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (leftCompleted && existingCommitmentId) {
    // פגישות ישנות ללא commitmentId (לפני הפיצ'ר) לא מושפעות — התנאי דורש שיוך.
    try {
      await prisma.clientCommitment.updateMany({
        where: { id: existingCommitmentId, usedSessions: { gt: 0 } },
        data: { usedSessions: { decrement: 1 } },
      });
      await prisma.therapySession.update({
        where: { id: sessionId },
        data: { commitmentId: null },
      });
    } catch (err) {
      logger.error("[commitment-usage] decrement failed", {
        sessionId,
        clientId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
