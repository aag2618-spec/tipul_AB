import { addToGoogleCalendar, updateGoogleCalendarEvent, deleteGoogleCalendarEvent, isGoogleCalendarConnected } from "@/lib/google-calendar";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

const SESSION_TYPE_HEBREW: Record<string, string> = {
  IN_PERSON: "פגישה פרונטלית",
  ONLINE: "פגישה אונליין",
  PHONE: "פגישה טלפונית",
  BREAK: "הפסקה",
};

interface SessionForCalendar {
  id: string;
  clientName: string | null;
  type: string;
  startTime: Date;
  endTime: Date;
  location?: string | null;
  topic?: string | null;
}

/**
 * יצירת אירוע ביומן גוגל כשנוצרת פגישה
 * לא חוסם — אם נכשל, הפגישה עדיין נשמרת
 */
export async function syncSessionToGoogleCalendar(
  userId: string,
  session: SessionForCalendar
): Promise<void> {
  try {
    const connected = await isGoogleCalendarConnected(userId);
    if (!connected) return;

    // לא מסנכרנים הפסקות ליומן
    if (session.type === "BREAK") return;

    // H3: לא שולחים שם מטופל ונושא פגישה ליומן Google — זה PHI/PII לצד שלישי
    // בלי הסכמה של המטופל. הסיכום הכללי שומר על פרטיות; המטפל יכול לפתוח
    // את המערכת לפרטים מלאים.
    const summary = "פגישה טיפולית";

    const descriptionParts: string[] = [];
    const typeLabel = SESSION_TYPE_HEBREW[session.type] || session.type;
    descriptionParts.push(`סוג: ${typeLabel}`);
    // session.topic ו-session.clientName נשמטו במכוון (H3).

    const eventId = await addToGoogleCalendar(userId, {
      summary,
      description: descriptionParts.join("\n"),
      startTime: new Date(session.startTime),
      endTime: new Date(session.endTime),
      location: session.location || undefined,
    });

    if (eventId) {
      await prisma.therapySession.update({
        where: { id: session.id },
        data: { googleEventId: eventId },
      });
      logger.info(`Google Calendar event created for session ${session.id}`);
    }
  } catch (error) {
    logger.error("[GoogleCalendarSync] Failed to create event:", {
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * עדכון אירוע ביומן גוגל כשפגישה מתעדכנת
 */
export async function syncSessionUpdateToGoogleCalendar(
  userId: string,
  session: Partial<SessionForCalendar> & { clientName?: string | null },
  googleEventId: string
): Promise<void> {
  try {
    const connected = await isGoogleCalendarConnected(userId);
    if (!connected) return;

    const updateData: {
      summary?: string;
      description?: string;
      startTime?: Date;
      endTime?: Date;
      location?: string;
    } = {};

    // H3: לא מעדכנים summary עם שם מטופל — PHI/PII לא יוצא ל-Google.
    // ה-summary המקורי "פגישה טיפולית" נשאר.
    if (session.startTime) {
      updateData.startTime = new Date(session.startTime);
    }
    if (session.endTime) {
      updateData.endTime = new Date(session.endTime);
    }
    if (session.location) {
      updateData.location = session.location;
    }

    await updateGoogleCalendarEvent(userId, googleEventId, updateData);
    logger.info(`Google Calendar event updated for eventId ${googleEventId}`);
  } catch (error) {
    logger.error("[GoogleCalendarSync] Failed to update event:", {
      googleEventId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * מחיקת אירוע מיומן גוגל כשפגישה מבוטלת/נמחקת
 */
export async function syncSessionDeletionToGoogleCalendar(
  userId: string,
  sessionId: string,
  googleEventId: string
): Promise<void> {
  try {
    const connected = await isGoogleCalendarConnected(userId);
    if (!connected) return;

    const deleted = await deleteGoogleCalendarEvent(userId, googleEventId);
    if (deleted) {
      await prisma.therapySession.update({
        where: { id: sessionId },
        data: { googleEventId: null },
      });
      logger.info(`Google Calendar event deleted for session ${sessionId}`);
    }
  } catch (error) {
    logger.error("[GoogleCalendarSync] Failed to delete event:", {
      sessionId,
      googleEventId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
