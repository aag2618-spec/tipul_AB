/**
 * לוגיקת התאמת רשימת-המתנה למשבצת שהתפנתה — פונקציות טהורות (ניתנות לבדיקה
 * בלי DB). בהינתן משבצת שהתפנתה (מטפל, יום, שעה, משך) מחזירות את הרשומות
 * התואמות, מדורגות דטרמיניסטית.
 */

export interface WaitlistCandidate {
  id: string;
  clientId: string;
  preferredTherapistId: string | null;
  durationMinutes: number;
  /** מערך ימים 0..6 (0=ראשון) או null = כל יום. */
  preferredDays: number[] | null;
  /** חלון שעות מועדף "HH:mm" או null = כל שעה. */
  preferredTimeFrom: string | null;
  preferredTimeTo: string | null;
  priority: number;
  createdAt: string | Date;
}

export interface FreedSlot {
  therapistId: string;
  /** יום בשבוע 0..6 (ישראל). */
  dayOfWeek: number;
  /** דקות מחצות (ישראל). */
  startMinutes: number;
  /** אורך המשבצת בדקות. */
  durationMinutes: number;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** האם רשומת המתנה מתאימה למשבצת שהתפנתה? */
export function waitlistEntryMatches(
  entry: WaitlistCandidate,
  slot: FreedSlot,
): boolean {
  // מטפל: רשומה ל"כל מטפל" (null) מתאימה לכולם; אחרת רק למטפל הספציפי.
  if (entry.preferredTherapistId && entry.preferredTherapistId !== slot.therapistId) {
    return false;
  }
  // משך: הפגישה המבוקשת לא יכולה להיות ארוכה מהמשבצת שהתפנתה.
  if (entry.durationMinutes > slot.durationMinutes) {
    return false;
  }
  // יום מועדף: null/ריק = כל יום; אחרת חייב להכיל את יום המשבצת.
  if (
    entry.preferredDays &&
    entry.preferredDays.length > 0 &&
    !entry.preferredDays.includes(slot.dayOfWeek)
  ) {
    return false;
  }
  // חלון שעות מועדף: אם הוגדר, המשבצת צריכה להיכנס *במלואה* בתוכו.
  if (entry.preferredTimeFrom || entry.preferredTimeTo) {
    const from = entry.preferredTimeFrom ? toMinutes(entry.preferredTimeFrom) : 0;
    const to = entry.preferredTimeTo ? toMinutes(entry.preferredTimeTo) : 24 * 60;
    if (slot.startMinutes < from) return false;
    if (slot.startMinutes + slot.durationMinutes > to) return false;
  }
  return true;
}

/**
 * מחזיר את הרשומות התואמות, מדורגות:
 *   1. התאמת-מטפל-ספציפי לפני "כל מטפל".
 *   2. priority יורד.
 *   3. FIFO — createdAt עולה.
 */
export function rankWaitlistMatches<T extends WaitlistCandidate>(
  entries: T[],
  slot: FreedSlot,
): T[] {
  return entries
    .filter((e) => waitlistEntryMatches(e, slot))
    .sort((a, b) => {
      const aSpecific = a.preferredTherapistId === slot.therapistId ? 0 : 1;
      const bSpecific = b.preferredTherapistId === slot.therapistId ? 0 : 1;
      if (aSpecific !== bSpecific) return aSpecific - bSpecific;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}

/**
 * חילוץ יום-בשבוע (0..6) ודקות-מחצות של תאריך, לפי שעון ישראל — ללא תלות
 * ב-timezone של השרת. משמש להמרת startTime של פגישה ל-FreedSlot.
 */
export function israelDayAndMinutes(date: Date): {
  dayOfWeek: number;
  startMinutes: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = weekdayMap[get("weekday")] ?? 0;
  const startMinutes = parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10);
  return { dayOfWeek, startMinutes };
}
