// ========================================
// קבועים מרכזיים של האפליקציה
// ========================================

// ---- Trial / Registration ----
/** מספר ימי ניסיון לחשבון חדש */
export const TRIAL_DAYS = 14;
/** מסלול AI במהלך תקופת הניסיון */
export const TRIAL_AI_TIER = "PRO";

// ---- Rate Limiting (Booking) ----
/** חלון rate limit להזמנות (מילישניות) */
export const BOOKING_RATE_LIMIT_WINDOW_MS = 60_000;
/** מספר הזמנות מותר בחלון */
export const BOOKING_RATE_LIMIT_MAX = 5;

// ---- Rate Limiting (Forgot Password) ----
/** הגדרת rate limit לשכחתי סיסמה */
export const FORGOT_PASSWORD_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
};

/** הגדרת rate limit לשליחה חוזרת של מייל אימות — לפי IP */
export const RESEND_VERIFICATION_RATE_LIMIT = {
  maxRequests: 3,
  windowMs: 15 * 60 * 1000,
};

/**
 * הגנה נוספת מפני email flooding — מגבילה כמה בקשות לאותה כתובת אימייל,
 * גם אם הן מגיעות מ-IPs שונים. מונע ממישהו להציף תיבת דואר של אחר.
 */
export const RESEND_VERIFICATION_PER_EMAIL_RATE_LIMIT = {
  maxRequests: 3,
  windowMs: 60 * 60 * 1000,
};
