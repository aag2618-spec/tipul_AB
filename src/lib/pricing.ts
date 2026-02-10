// src/lib/pricing.ts
// ========================================
// מקור אמת מרכזי לתמחור - כל המחירים מוגדרים כאן בלבד
// ========================================

export const PLAN_NAMES: Record<string, string> = {
  ESSENTIAL: "Essential",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

/**
 * תמחור לפי מסלול ותקופה
 * מפתח ראשון = שם מסלול, מפתח שני = מספר חודשים, ערך = סכום כולל לתקופה בש"ח
 */
export const PRICING: Record<string, Record<number, number>> = {
  ESSENTIAL: { 1: 117, 3: 333, 6: 631, 12: 1170 },
  PRO:       { 1: 145, 3: 413, 6: 783, 12: 1450 },
  ENTERPRISE:{ 1: 220, 3: 627, 6: 1188, 12: 2200 },
};

/** מחיר חודשי (תקופה 1 חודש) */
export const MONTHLY_PRICES: Record<string, number> = {
  ESSENTIAL: PRICING.ESSENTIAL[1],
  PRO: PRICING.PRO[1],
  ENTERPRISE: PRICING.ENTERPRISE[1],
};

/** ימים לכל תקופה */
export const PERIOD_DAYS: Record<number, number> = {
  1: 30,
  3: 90,
  6: 180,
  12: 365,
};

/** שם תקופה בעברית */
export const PERIOD_LABELS: Record<number, string> = {
  1: "חודשי",
  3: "רבעוני (3 חודשים)",
  6: "חצי שנתי (6 חודשים)",
  12: "שנתי",
};

/** מחשב הנחה באחוזים עבור מסלול ותקופה */
export function getDiscount(plan: string, months: number): number {
  const pricing = PRICING[plan];
  if (!pricing || months <= 1) return 0;
  const monthly = pricing[1];
  const total = pricing[months];
  if (!monthly || !total) return 0;
  return Math.round(((monthly * months - total) / (monthly * months)) * 100);
}

/** מחשב מחיר חודשי ממוצע עבור מסלול ותקופה */
export function getAverageMonthlyPrice(plan: string, months: number): number {
  const pricing = PRICING[plan];
  if (!pricing || !pricing[months]) return 0;
  return Math.round(pricing[months] / months);
}

/**
 * מזהה תקופת חיוב (בימים) לפי סכום הגבייה והמסלול
 * שימושי לwebhooks שלא מעבירים את תקופת החיוב
 */
export function detectPeriodFromAmount(tier: string, amount: number): number {
  const tierPricing = PRICING[tier];
  if (!tierPricing) return 30;
  
  // חיפוש התאמה מדויקת
  for (const [months, price] of Object.entries(tierPricing)) {
    if (price === amount) return PERIOD_DAYS[Number(months)] || 30;
  }
  
  // חיפוש התאמה קרובה (סטייה של עד ₪5 - בגלל עמלות אפשריות)
  for (const [months, price] of Object.entries(tierPricing)) {
    if (Math.abs(price - amount) <= 5) return PERIOD_DAYS[Number(months)] || 30;
  }
  
  return 30; // ברירת מחדל
}
