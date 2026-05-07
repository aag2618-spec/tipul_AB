import type { Prisma } from "@prisma/client";

const CANCELLATION_NOTE_PREFIX =
  "[העברת מטופל] הפגישה בוטלה אוטומטית עקב העברת המטופל/ת למטפל/ת אחר/ת";

export type CancelOrDeleteResult = {
  deleted: string[];
  cancelled: string[];
};

/**
 * עוברים על פגישות ב-sessionIds:
 *   אם אין בה payment ואין recording — מוחקים לגמרי (DELETE).
 *   אם יש לה payment או recording — מסמנים CANCELLED (כדי לשמור את שרשרת
 *   הקבלה/תשלום והקלטות; הפגישה נעלמת מתוצאות חיפוש סטנדרטיות).
 *
 * נקראת בתוך transaction (tx). כל הקריאות שלה ל-DB עוברות דרך tx.
 *
 * ביצועים: 1 SELECT + עד 2 bulk operations (deleteMany + updateMany) במקום
 * 2N קריאות. תחת Serializable isolation, פחות round-trips = פחות סיכון
 * ל-40001 retry/timeout. cancellationReason מכיל את ה-transferLogId לאודיט
 * forensics; notes לא מתעדכן ב-bulk (היה מצריך אופציונליות שלא משתלמת).
 *
 * הפילטר ב-/api/sessions (GET) **לא** מציג CANCELLED ביומן רגיל, אז הפגישות
 * נעלמות מהתצוגה אבל נשארות בDB ל-audit/forensics.
 */
export async function cancelOrDeleteFutureSessions(
  tx: Prisma.TransactionClient,
  sessionIds: string[],
  context: { transferLogId: string }
): Promise<CancelOrDeleteResult> {
  if (sessionIds.length === 0) {
    return { deleted: [], cancelled: [] };
  }

  // 1 SELECT — שליפה bulk של כל הפגישות עם תלויותיהן הקריטיות
  const sessions = await tx.therapySession.findMany({
    where: { id: { in: sessionIds } },
    select: {
      id: true,
      payment: { select: { id: true } },
      recordings: { select: { id: true }, take: 1 },
    },
  });

  // חלוקה לקטגוריות — DELETE-able (אין payment ואין recording) vs CANCEL-able
  const deleteIds: string[] = [];
  const cancelIds: string[] = [];
  for (const s of sessions) {
    const hasFinancialRecords = !!s.payment;
    const hasRecording = s.recordings.length > 0;
    if (hasFinancialRecords || hasRecording) {
      cancelIds.push(s.id);
    } else {
      deleteIds.push(s.id);
    }
  }

  // bulk CANCEL — updateMany יחיד (note זהה לכל הקבוצה)
  if (cancelIds.length > 0) {
    const note = `${CANCELLATION_NOTE_PREFIX} (transferLogId: ${context.transferLogId})`;
    await tx.therapySession.updateMany({
      where: { id: { in: cancelIds } },
      data: {
        status: "CANCELLED",
        cancellationReason: note,
        cancelledAt: new Date(),
        cancelledBy: "SYSTEM",
      },
    });
  }

  // bulk DELETE — deleteMany יחיד.
  // SessionNote (Cascade), CommunicationLog (SetNull), SMSReminder (Cascade) —
  // ינוקו אוטומטית ע"י Prisma.
  if (deleteIds.length > 0) {
    await tx.therapySession.deleteMany({ where: { id: { in: deleteIds } } });
  }

  return { deleted: deleteIds, cancelled: cancelIds };
}
