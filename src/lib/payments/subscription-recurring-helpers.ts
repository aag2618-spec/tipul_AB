// ============================================================================
// Subscription Recurring — Pure Helpers
// ============================================================================
// פונקציות טהורות (ללא DB / HTTP) הניתנות לבדיקה ב-vitest בלי mocks.
// מופרדות מ-subscription-recurring.ts הראשי שמשתמש ב-Prisma + Cardcom HTTP.
//
// קריטי לכסף — לפי feedback_critical_changes_process: TDD ראשון, אז impl.
// כל שינוי כאן חייב להתחיל בעדכון subscription-recurring.test.ts.
// ============================================================================

/**
 * לוח ניסיונות: יום 1 (החיוב הראשון), יום 3, יום 7 — מהיום שהחיוב הראשון
 * (lastChargeError הראשון) קרה. שלושה ניסיונות סה"כ.
 */
export const RETRY_SCHEDULE_DAYS = [1, 3, 7] as const;

/** ניסיון 1, 2, 3 — אחרי 3 כושלים → חסימה. */
export const MAX_CHARGE_ATTEMPTS = 3;

/**
 * תאריך הניסיון הבא לפי לוח הזמנים. מחושב מהיום שהניסיון הראשון קרה
 * (firstAttemptDate) כדי שעיכוב בין ניסיונות לא יזיז את כל הלוח.
 *
 * @param firstAttemptDate — מתי החיוב הראשון נכשל (= יום 1 בלוח).
 * @param attemptJustCompleted — מספר הניסיון שהסתיים עכשיו (1, 2, או 3).
 * @returns Date של הניסיון הבא, או null אם אין יותר ניסיונות.
 */
export function calculateNextAttemptDate(params: {
  firstAttemptDate: Date;
  attemptJustCompleted: number;
}): Date | null {
  const { firstAttemptDate, attemptJustCompleted } = params;
  if (
    !Number.isInteger(attemptJustCompleted) ||
    attemptJustCompleted < 1 ||
    attemptJustCompleted >= RETRY_SCHEDULE_DAYS.length
  ) {
    return null;
  }
  const nextDay = RETRY_SCHEDULE_DAYS[attemptJustCompleted];
  if (!nextDay) return null;
  // יום הניסיון הראשון הוא יום 1, אז delta = nextDay - 1
  const delta = nextDay - 1;
  return new Date(firstAttemptDate.getTime() + delta * 24 * 60 * 60 * 1000);
}

/**
 * האם לחסום את המשתמש אחרי ניסיון כושל הזה?
 * חסימה רק אחרי MAX_CHARGE_ATTEMPTS (3) ניסיונות.
 */
export function shouldBlockAfterAttempt(attemptNumber: number): boolean {
  return attemptNumber >= MAX_CHARGE_ATTEMPTS;
}

/**
 * האם הטוקן פג לפי MM/YYYY (כלל קארדקום: הטוקן בתוקף עד סוף החודש).
 *
 * fail-safe: חודש לא חוקי (0, 13+) או שנה לא הגיונית → נחשב פג.
 */
export function isTokenExpired(params: {
  expiryMonth: number;
  expiryYear: number;
  now: Date;
}): boolean {
  const { expiryMonth, expiryYear, now } = params;
  if (
    !Number.isInteger(expiryMonth) ||
    !Number.isInteger(expiryYear) ||
    expiryMonth < 1 ||
    expiryMonth > 12 ||
    expiryYear < 2000 ||
    expiryYear > 2100
  ) {
    return true;
  }
  // סוף החודש בתום היום האחרון של חודש התוקף, ב-UTC
  // (קארדקום מתייחס לכל חודש כיחידה — הטוקן בתוקף עד 23:59:59 של היום האחרון).
  const endOfExpiryMonth = new Date(
    Date.UTC(expiryYear, expiryMonth, 1) - 1
  );
  return now.getTime() > endOfExpiryMonth.getTime();
}

/**
 * חישוב כמה חודשים יש בתקופה (מ-periodStart ל-periodEnd).
 * משמש לקריאה ל-`getPriceForPeriod` ב-cron כשמחשבים מחיר חידוש.
 *
 * ערכי מחזיר: 1, 3, 6, 12 — אם נופל בין הערכים, מתקרב לאחד מהם.
 * fail-safe: null/inverted → 1 (חודשי).
 */
export function getPeriodMonthsFromDates(
  periodStart: Date | null,
  periodEnd: Date | null
): 1 | 3 | 6 | 12 {
  if (!periodStart || !periodEnd) return 1;
  const days = Math.round(
    (periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (days <= 0) return 1;
  // טווחים אינטואיטיביים סביב 30/90/180/365 — כל +-15 ימים שייך לאותה תקופה
  if (days >= 350) return 12;
  if (days >= 165) return 6;
  if (days >= 75) return 3;
  return 1;
}

/**
 * הוספת חודשים קלנדריים לתאריך (calendar-aware, לא ms קשיח).
 * 1 פברואר + 1 חודש = 1 מרץ (לא 31 ימים אחורה).
 * 31 ינואר + 1 חודש = 28/29 פברואר (clamping ליום אחרון בחודש).
 *
 * שימוש: חישוב periodEnd חדש מ-periodStart + monthsToAdd.
 */
export function addCalendarMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1); // למנוע "גלישה" (Jan 31 + 1 → Mar 3)
  d.setUTCMonth(d.getUTCMonth() + months);
  // החזר את היום, אבל clamp ליום אחרון של חודש היעד
  const lastDayOfMonth = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDayOfMonth));
  return d;
}
