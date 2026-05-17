// ============================================================================
// Admin Subscription Actions — Pure Helpers (Stage 6)
// ============================================================================
// פונקציות טהורות (ללא DB / HTTP) ל-decision logic של פעולות אדמין על מנוי משתמש.
// כל שינוי כאן חייב להתחיל בעדכון admin-subscription-actions.test.ts (כסף!).
// ============================================================================

import type { AITier, PackageType } from "@prisma/client";

export type ValidationResult =
  | { allowed: true }
  | { allowed: false; reason: string };

// ============================================================================
// קבועי גבולות
// ============================================================================

/** מקסימום ימי הארכת ניסיון בפעולה אחת. אדמין יכול לבצע 2 הארכות. */
export const MAX_TRIAL_EXTENSION_DAYS = 90;

/** מקסימום ימי הארכת מנוי פעיל בפעולה אחת. גבול הגיוני: שנה אחת. */
export const MAX_SUBSCRIPTION_EXTENSION_DAYS = 365;

/** מקסימום מחיר ידני (defense-in-depth). */
export const MAX_OVERRIDE_PRICE_ILS = 100_000;

const VALID_TIERS: readonly AITier[] = ["ESSENTIAL", "PRO", "ENTERPRISE"];

// ============================================================================
// validateExtendTrial — הארכת ניסיון
// ============================================================================

export function validateExtendTrial(input: {
  days: number;
}): ValidationResult {
  if (!Number.isInteger(input.days) || input.days <= 0) {
    return { allowed: false, reason: "מספר ימים חייב להיות שלם וחיובי." };
  }
  if (input.days > MAX_TRIAL_EXTENSION_DAYS) {
    return {
      allowed: false,
      reason: `מקסימום ${MAX_TRIAL_EXTENSION_DAYS} ימים לפעולה אחת.`,
    };
  }
  return { allowed: true };
}

// ============================================================================
// calculateNewTrialEndsAt — תאריך ניסיון חדש
// ============================================================================

export function calculateNewTrialEndsAt(input: {
  currentTrialEndsAt: Date | null;
  daysToAdd: number;
  now: Date;
}): Date {
  // הבסיס: ה-currentTrialEndsAt אם הוא בעתיד, אחרת now (לא מאפשרים בעבר).
  const base =
    input.currentTrialEndsAt &&
    input.currentTrialEndsAt.getTime() > input.now.getTime()
      ? input.currentTrialEndsAt
      : input.now;
  return new Date(base.getTime() + input.daysToAdd * 24 * 60 * 60 * 1000);
}

// ============================================================================
// validateExtendSubscription — הארכת מנוי פעיל (לא ניסיון!)
// ============================================================================
// מוסיף ימים ל-subscriptionEndsAt של משתמש פעיל. שונה מ-extend_trial שעובד
// רק על trialEndsAt. השימוש: פיצוי על תקלה, הענקת ימים על חשבון בית.

export function validateExtendSubscription(input: {
  days: number;
  note: string | null;
}): ValidationResult {
  if (!Number.isInteger(input.days) || input.days <= 0) {
    return { allowed: false, reason: "מספר ימים חייב להיות שלם וחיובי." };
  }
  if (input.days > MAX_SUBSCRIPTION_EXTENSION_DAYS) {
    return {
      allowed: false,
      reason: `מקסימום ${MAX_SUBSCRIPTION_EXTENSION_DAYS} ימים לפעולה אחת.`,
    };
  }
  const noteTrimmed = (input.note ?? "").trim();
  if (noteTrimmed.length < 3) {
    return {
      allowed: false,
      reason: "נדרשת הערה (תיעוד הסיבה) — לפחות 3 תווים.",
    };
  }
  return { allowed: true };
}

// ============================================================================
// calculateNewSubscriptionEndsAt — תאריך סיום מנוי חדש
// ============================================================================
// בסיס: subscriptionEndsAt הקיים אם הוא בעתיד, אחרת now (לא מאפשרים להאריך
// מנוי שכבר פג ל"מנוי בעבר"). מוסיף את ה-days מהבסיס.

export function calculateNewSubscriptionEndsAt(input: {
  currentEndsAt: Date | null;
  daysToAdd: number;
  now: Date;
}): Date {
  const base =
    input.currentEndsAt &&
    input.currentEndsAt.getTime() > input.now.getTime()
      ? input.currentEndsAt
      : input.now;
  return new Date(base.getTime() + input.daysToAdd * 24 * 60 * 60 * 1000);
}

// ============================================================================
// validateGrantPackage — מתן חבילה חינם
// ============================================================================

const VALID_PACKAGE_TYPES: readonly PackageType[] = ["SMS", "AI_DETAILED_ANALYSIS"];

export function validateGrantPackage(input: {
  packageType: PackageType;
  credits: number;
}): ValidationResult {
  if (!(VALID_PACKAGE_TYPES as readonly string[]).includes(input.packageType)) {
    return { allowed: false, reason: "סוג חבילה לא תקין." };
  }
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    return {
      allowed: false,
      reason: "כמות יחידות חייבת להיות שלמה וחיובית.",
    };
  }
  return { allowed: true };
}

// ============================================================================
// validateChangeTier — שינוי tier ידני
// ============================================================================

export function validateChangeTier(input: {
  fromTier: AITier;
  toTier: AITier;
}): ValidationResult {
  if (!(VALID_TIERS as readonly string[]).includes(input.toTier)) {
    return { allowed: false, reason: "תוכנית יעד לא חוקית." };
  }
  if (input.fromTier === input.toTier) {
    return {
      allowed: false,
      reason: "המשתמש כבר נמצא בתוכנית זו.",
    };
  }
  return { allowed: true };
}

// ============================================================================
// validateOverridePrice — דריסת מחיר מנוי (מתורגם ל-PricingPolicy scope=USER)
// ============================================================================

export function validateOverridePrice(input: {
  amountIls: number;
}): ValidationResult {
  if (!Number.isFinite(input.amountIls)) {
    return { allowed: false, reason: "מחיר לא תקין." };
  }
  if (input.amountIls <= 0) {
    return {
      allowed: false,
      reason: "מחיר חייב להיות חיובי. להגדרת מנוי חינם — השתמש בפעולה ייעודית.",
    };
  }
  if (input.amountIls > MAX_OVERRIDE_PRICE_ILS) {
    return {
      allowed: false,
      reason: `מחיר חורג מהמותר (${MAX_OVERRIDE_PRICE_ILS.toLocaleString("he-IL")} ₪).`,
    };
  }
  return { allowed: true };
}

// ============================================================================
// validateSetFree — הפיכת מנוי לחינם / ביטול חינם
// ============================================================================

export function validateSetFree(input: {
  isFree: boolean;
  note: string | null;
}): ValidationResult {
  // הפעלת חינם דורשת הערה (תיעוד מי/למה)
  if (input.isFree && (!input.note || input.note.trim().length < 3)) {
    return {
      allowed: false,
      reason: "נדרשת הערה (תיעוד מי/למה) להפיכת המנוי לחינם.",
    };
  }
  return { allowed: true };
}

// ============================================================================
// validateRefundPayment — זיכוי תשלום
// ============================================================================

export function validateRefundPayment(input: {
  originalAmount: number;
  refundAmount: number;
  alreadyRefunded: number;
  reason: string;
}): ValidationResult {
  if (!Number.isFinite(input.refundAmount) || input.refundAmount <= 0) {
    return { allowed: false, reason: "סכום זיכוי חייב להיות חיובי." };
  }
  const reasonTrimmed = (input.reason ?? "").trim();
  if (reasonTrimmed.length < 3) {
    return {
      allowed: false,
      reason: "נדרשת סיבת זיכוי (תיעוד).",
    };
  }
  const totalRefund = input.alreadyRefunded + input.refundAmount;
  if (totalRefund > input.originalAmount + 0.01) {
    return {
      allowed: false,
      reason: `סך הזיכויים (${totalRefund.toFixed(2)} ₪) חורג מהסכום המקורי (${input.originalAmount.toFixed(2)} ₪).`,
    };
  }
  return { allowed: true };
}
