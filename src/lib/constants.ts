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
