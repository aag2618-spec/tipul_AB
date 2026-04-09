/**
 * פונקציות משותפות למערכת ההתראות — אייקונים, עיצוב זמנים, ניתוב, חלונות זמן
 */

// ── סוגי התראות ──
export const NOTIFICATION_TYPES = [
  "MORNING_SUMMARY",
  "EVENING_SUMMARY",
  "PENDING_TASKS",
  "PAYMENT_REMINDER",
  "SESSION_REMINDER",
  "EMAIL_SENT",
  "EMAIL_RECEIVED",
  "CANCELLATION_REQUEST",
  "BOOKING_REQUEST",
  "CUSTOM",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ── מיפוי אייקונים לפי סוג התראה ──
// כל סוג מקבל שם אייקון וצבע. הרנדור עצמו נעשה בקומפוננטות.
export interface NotificationIconInfo {
  icon: "sun" | "moon" | "list-todo" | "credit-card" | "calendar" | "mail" | "x-circle" | "bell";
  color: string;
}

export function getNotificationIconInfo(type: string): NotificationIconInfo {
  switch (type) {
    case "MORNING_SUMMARY":
      return { icon: "sun", color: "text-amber-500" };
    case "EVENING_SUMMARY":
      return { icon: "moon", color: "text-indigo-500" };
    case "PENDING_TASKS":
    case "CUSTOM":
      return { icon: "list-todo", color: "text-amber-500" };
    case "PAYMENT_REMINDER":
      return { icon: "credit-card", color: "text-red-500" };
    case "SESSION_REMINDER":
      return { icon: "calendar", color: "text-green-500" };
    case "BOOKING_REQUEST":
      return { icon: "calendar", color: "text-amber-500" };
    case "CANCELLATION_REQUEST":
      return { icon: "x-circle", color: "text-orange-500" };
    case "EMAIL_RECEIVED":
    case "EMAIL_SENT":
      return { icon: "mail", color: "text-sky-500" };
    default:
      return { icon: "bell", color: "text-gray-500" };
  }
}

// ── עיצוב זמנים יחסיים בעברית תקינה ──
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "עכשיו";

  if (minutes < 60) {
    if (minutes === 1) return "לפני דקה";
    if (minutes === 2) return "לפני שתי דקות";
    return `לפני ${minutes} דקות`;
  }

  if (hours < 24) {
    if (hours === 1) return "לפני שעה";
    if (hours === 2) return "לפני שעתיים";
    return `לפני ${hours} שעות`;
  }

  if (days < 7) {
    if (days === 1) return "לפני יום";
    if (days === 2) return "לפני יומיים";
    return `לפני ${days} ימים`;
  }

  return date.toLocaleDateString("he-IL");
}

// ── חילוץ מידע הזמנה מתוכן התראה ──
export function extractBookingInfo(content: string): {
  date: string | null;
  time: string | null;
  sessionId: string | null;
} {
  const match = content.match(/\[(\d{4}-\d{2}-\d{2})\|(\d{1,2}:\d{2})\|([a-z0-9]+)\]/);
  if (match) return { date: match[1], time: match[2], sessionId: match[3] };
  const dateOnly = content.match(/\[(\d{4}-\d{2}-\d{2})\]/);
  if (dateOnly) return { date: dateOnly[1], time: null, sessionId: null };
  return { date: null, time: null, sessionId: null };
}

// ── ניתוב לפי סוג התראה ──
export function getNotificationRoute(type: string): string {
  switch (type) {
    case "BOOKING_REQUEST":
    case "CANCELLATION_REQUEST":
    case "MORNING_SUMMARY":
      return "/dashboard/calendar";
    case "EVENING_SUMMARY":
    case "PENDING_TASKS":
      return "/dashboard?scrollTo=personal-tasks";
    case "PAYMENT_REMINDER":
      return "/dashboard/payments";
    default:
      return "/dashboard/communications";
  }
}

// ── בדיקת חלון זמן (לקרון) ──
export function isInTimeWindow(
  currentMinutesSinceMidnight: number,
  targetTime: string,
  windowMinutes: number = 30
): boolean {
  const [h, m] = targetTime.split(":").map(Number);
  const targetMinutes = h * 60 + m;
  return (
    currentMinutesSinceMidnight >= targetMinutes &&
    currentMinutesSinceMidnight < targetMinutes + windowMinutes
  );
}

// ── תצוגת באדג' ──
export function formatBadgeCount(count: number): string | null {
  if (count <= 0) return null;
  if (count > 9) return "9+";
  return count.toString();
}
