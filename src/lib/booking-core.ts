/**
 * Booking core — לוגיקת תאריך/שעה/חרוצים משותפת לזימון עצמי.
 *
 * חולץ מ-src/app/api/booking/[slug]/route.ts כדי שגם מסלול הקישור האישי
 * (/api/booking/t/[token]) ישתמש בו. כל הפונקציות עובדות ב-timezone של ישראל
 * (Asia/Jerusalem) ומטפלות נכון במעבר שעון ובגבולות שישי/מוצ"ש.
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^\d{1,2}:\d{2}$/;
const PHONE_DIGITS_RE = /^(05\d{8}|9725\d{8})$/;

/** ממיר תאריך+שעה (מחרוזות) ל-Date ב-timezone של ישראל, נכון גם סביב מעבר שעון. */
export function toIsraelDate(dateStr: string, timeStr: string = "00:00"): Date {
  const testDate = new Date(`${dateStr}T12:00:00Z`);
  const israelHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(testDate)
  );
  const offsetHours = israelHour - 12;
  const offsetStr = `+${String(offsetHours).padStart(2, "0")}:00`;
  return new Date(`${dateStr}T${timeStr}:00${offsetStr}`);
}

/** יום בשבוע (0=ראשון..6=שבת) לפי תאריך ישראלי. */
export function getIsraelDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

/** פורמט תאריך מלא בעברית (he-IL, Asia/Jerusalem). */
export function formatIsraelDate(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  return date.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * נרמול טלפון ישראלי לפורמט אחיד 05XXXXXXXX, או null אם לא תקין.
 * תומך ב-+972 ו-972 כקידומות.
 */
export function normalizeIsraeliPhone(phone: string): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-.()]/g, "");
  if (cleaned.startsWith("+972")) cleaned = "0" + cleaned.slice(4);
  if (cleaned.startsWith("972") && cleaned.length === 12) cleaned = "0" + cleaned.slice(3);
  return PHONE_DIGITS_RE.test(cleaned) || /^05\d{8}$/.test(cleaned) ? cleaned : null;
}

/**
 * הגבלות שבת על שעות העבודה:
 *   - שישי (5): לא אחרי 17:30.
 *   - מוצ"ש (6): לא לפני 17:45.
 */
export function applyShabbatLimits(
  dayOfWeek: number,
  start: string,
  end: string
): { start: string; end: string } {
  if (dayOfWeek === 5) {
    const maxEnd = "17:30";
    return { start, end: end > maxEnd ? maxEnd : end };
  }
  if (dayOfWeek === 6) {
    const minStart = "17:45";
    return { start: start < minStart ? minStart : start, end };
  }
  return { start, end };
}

/**
 * מייצר רשימת חרוצים פנויים ליום, בהתחשב במשך, חיץ, מינימום-שעות-מראש,
 * פגישות קיימות, והפסקות.
 */
export function generateTimeSlots(
  dateStr: string,
  dayStart: string,
  dayEnd: string,
  duration: number,
  buffer: number,
  minAdvanceHours: number,
  existingSessions: Array<{ startTime: Date; endTime: Date }>,
  breaks: Array<{ start: string; end: string }>
): string[] {
  const slots: string[] = [];
  const now = new Date();
  const [startH, startM] = dayStart.split(":").map(Number);
  const [endH, endM] = dayEnd.split(":").map(Number);

  const slotStep = Math.max(1, duration + buffer);
  let currentMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (currentMinutes + duration <= endMinutes) {
    const h = Math.floor(currentMinutes / 60).toString().padStart(2, "0");
    const m = (currentMinutes % 60).toString().padStart(2, "0");
    const slotStart = toIsraelDate(dateStr, `${h}:${m}`);
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

    const hoursUntil = (slotStart.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntil < minAdvanceHours) {
      currentMinutes += slotStep;
      continue;
    }

    const isInBreak = breaks.some((brk) => {
      const bs = brk.start?.split(":").map(Number);
      const be = brk.end?.split(":").map(Number);
      if (!bs || bs.length < 2 || !be || be.length < 2) return false;
      const breakStart = bs[0] * 60 + bs[1];
      const breakEnd = be[0] * 60 + be[1];
      return currentMinutes < breakEnd && currentMinutes + duration > breakStart;
    });

    if (isInBreak) {
      currentMinutes += slotStep;
      continue;
    }

    const hasConflict = existingSessions.some(
      (s) => slotStart < s.endTime && slotEnd > s.startTime
    );

    if (!hasConflict) {
      slots.push(`${h}:${m}`);
    }

    currentMinutes += slotStep;
  }

  return slots;
}
