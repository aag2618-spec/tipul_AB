/**
 * Default values — מקור אמת יחיד (single source of truth) ל-bootstrap data.
 *
 * Stage 1.18.2 follow-up (Cursor LOW): לפני כן ה-defaults היו מוגדרים
 * בשני מקומות (prisma/seed.ts + lazy-init ב-GET handlers), מה שגרם
 * ל-drift risk — שינוי באחד לא מתורגם לשני.
 *
 * כל הקוד שמאתחל FeatureFlag או GlobalAISettings חייב לייבא מכאן.
 *
 * צרכנים:
 *   - prisma/seed.ts                                  (CLI seed)
 *   - src/app/api/admin/ai-settings/route.ts          (GET lazy-init fallback)
 *   - src/app/api/admin/feature-flags/route.ts        (GET lazy-init fallback)
 */

/**
 * ברירות מחדל ל-GlobalAISettings. singleton עם id קבוע.
 * שינויים פה ישפיעו גם על seed וגם על lazy-init.
 */
export const DEFAULT_AI_SETTINGS = {
  dailyLimitEssential: 0,
  dailyLimitPro: 30,
  dailyLimitEnterprise: 100,
  monthlyLimitEssential: 0,
  monthlyLimitPro: 600,
  monthlyLimitEnterprise: 2000,
  maxMonthlyCostBudget: 5000,
  alertThreshold: 4000,
  blockOnExceed: false,
  alertAdminOnExceed: true,
  enableCache: true,
  compressPrompts: true,
} as const;

/**
 * 6 feature flags ראשוניים לאתחול. נוצרים עם isEnabled=true.
 */
export const DEFAULT_FEATURE_FLAGS = [
  {
    key: "ai_session_prep",
    name: "הכנה לפגישה עם AI",
    description: "הכנה אוטומטית לפגישות באמצעות AI",
    tiers: ["PRO", "ENTERPRISE"],
  },
  {
    key: "ai_detailed_analysis",
    name: "ניתוח מפורט AI",
    description: "ניתוח מפורט של פגישות באמצעות AI",
    tiers: ["ENTERPRISE"],
  },
  {
    key: "ai_questionnaire",
    name: "ניתוח שאלונים AI",
    description: "ניתוח שאלונים אוטומטי באמצעות AI",
    tiers: ["PRO", "ENTERPRISE"],
  },
  {
    key: "email_threads",
    name: "שרשורי מייל",
    description: "ניהול שרשורי אימייל עם מטופלים",
    tiers: ["PRO", "ENTERPRISE"],
  },
  {
    key: "file_attachments",
    name: "קבצים מצורפים",
    description: "צירוף קבצים להודעות ולפגישות",
    tiers: ["PRO", "ENTERPRISE"],
  },
  {
    key: "advanced_reports",
    name: "דוחות מתקדמים",
    description: "גישה לדוחות ואנליטיקה מתקדמים",
    tiers: ["ENTERPRISE"],
  },
] as const;

/**
 * id הקבוע ל-GlobalAISettings (singleton). לא ב-Prisma default (cuid) כדי
 * לוודא שתמיד רק רשומה אחת קיימת, וניתן לאתר אותה בקלות.
 */
export const GLOBAL_AI_SETTINGS_ID = "default";
