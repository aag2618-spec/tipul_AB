// ==================== Clinic SMS Quota Management ====================
// מעקב מכסת SMS חודשית לקליניקה רב-מטפלים.
//
// הבדל ממשתמש בודד:
// - משתמש בודד (organizationId=null): שימוש ב-CommunicationSetting.smsMonthlyUsage
//   הקיים. הקוד הזה לא מתערב.
// - קליניקה (organizationId!=null): שימוש ב-OrgSmsUsage המשותף לכל החברים.
//   המכסה נלקחת מ-ClinicPricingPlan.smsQuotaPerMonth (או CustomContract.customSmsQuota).
//
// מבנה: רשומה אחת ל-(organizationId, year, month) — UPSERT-friendly.

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ============================================================================
// Types
// ============================================================================

export type QuotaCheckResult = {
  /** מותר לשלוח? */
  allowed: boolean;
  /** כמות SMS שנשלחה החודש. */
  used: number;
  /** מכסה חודשית. */
  quota: number;
  /** כמות נותרת. */
  remaining: number;
  /** האם בקליניקה (org-scoped) או user-scoped. */
  source: "organization" | "user_individual";
};

// ============================================================================
// Pure helpers
// ============================================================================

/**
 * חישוב חודש/שנה — מ-Date נתון.
 * משתמש ב-Asia/Jerusalem timezone כי המערכת ישראלית והחיוב לפי לוח שנה ישראלי.
 *
 * NOTE: ב-Node.js בשרת, יש להגדיר process.env.TZ או להשתמש ב-Intl.DateTimeFormat.
 * כאן אנו משתמשים ב-getMonth() שעובד בלוקל הסרבר. ב-Render/Vercel ה-default הוא UTC,
 * וכל המערכת מסתמכת על TZ=Asia/Jerusalem ב-env. אם לא מוגדר — חישוב לפי UTC, מה
 * שעלול להזיז SMS ב-3-2 שעות בסוף חודש. סיכון קטן (לא קריטי).
 */
export function monthYearOf(date: Date): { month: number; year: number } {
  return {
    month: date.getMonth() + 1, // JS getMonth() 0-indexed; אנחנו שומרים 1-12
    year: date.getFullYear(),
  };
}

/**
 * האם רשומה הגיעה למכסה? (used >= quota).
 */
export function isOverQuota(used: number, quota: number): boolean {
  return used >= quota;
}

/**
 * חישוב remaining — לא יורד מתחת ל-0 (אם הוגזם, נשאר 0).
 */
export function calcRemaining(used: number, quota: number): number {
  return Math.max(0, quota - used);
}

// ============================================================================
// DB operations
// ============================================================================

/**
 * UPSERT — מעלה את smsCount ב-amount. אם הרשומה לא קיימת, יוצר חדשה.
 * Atomic — שימוש ב-Prisma upsert עם increment.
 *
 * @param organizationId — id של הארגון.
 * @param amount — כמות SMS להוסיף (default 1). שימושי לbulk ב-MMS.
 * @param at — תאריך לחישוב חודש/שנה (default now).
 */
export async function incrementOrgSmsUsage(
  organizationId: string,
  amount: number = 1,
  at: Date = new Date()
): Promise<{ smsCount: number }> {
  if (amount <= 0) {
    throw new Error(`incrementOrgSmsUsage: amount must be positive, got ${amount}`);
  }

  const { month, year } = monthYearOf(at);

  const result = await prisma.orgSmsUsage.upsert({
    where: {
      organizationId_year_month: { organizationId, year, month },
    },
    create: { organizationId, year, month, smsCount: amount },
    update: { smsCount: { increment: amount } },
    select: { smsCount: true },
  });

  return { smsCount: result.smsCount };
}

/**
 * שליפת מכסת SMS חודשית לארגון — מהתוכנית או מהחוזה המותאם.
 * חוזה מותאם עם customSmsQuota גובר על התוכנית.
 *
 * @returns מספר SMS מותר לחודש, או 0 אם לא נמצאה תוכנית.
 */
export async function getOrgMonthlySmsQuota(organizationId: string): Promise<number> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      pricingPlan: { select: { smsQuotaPerMonth: true } },
      customContract: {
        select: { customSmsQuota: true, startDate: true, endDate: true },
      },
    },
  });

  if (!org) return 0;

  const now = new Date();
  if (
    org.customContract &&
    org.customContract.customSmsQuota !== null &&
    org.customContract.startDate <= now &&
    now < org.customContract.endDate
  ) {
    return org.customContract.customSmsQuota;
  }

  return org.pricingPlan?.smsQuotaPerMonth ?? 0;
}

/**
 * שליפת usage חודשי נוכחי לארגון.
 * מחזיר 0 אם אין רשומה (חודש שעוד לא התחיל לצבור).
 */
export async function getOrgMonthlySmsUsage(
  organizationId: string,
  at: Date = new Date()
): Promise<number> {
  const { month, year } = monthYearOf(at);
  const usage = await prisma.orgSmsUsage.findUnique({
    where: {
      organizationId_year_month: { organizationId, year, month },
    },
    select: { smsCount: true },
  });
  return usage?.smsCount ?? 0;
}

/**
 * בדיקה מקיפה לפני שליחת SMS — האם יש מכסה?
 * שימוש לפני קריאה ל-Twilio/SMS provider.
 *
 * אם המשתמש לא בארגון (organizationId=null) — מחזיר source="user_individual"
 * וה-caller צריך לבדוק את ה-CommunicationSetting הרגיל.
 */
export async function checkSmsQuota(
  userId: string,
  at: Date = new Date()
): Promise<QuotaCheckResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });

  if (!user?.organizationId) {
    return {
      allowed: true,
      used: 0,
      quota: 0,
      remaining: 0,
      source: "user_individual",
    };
  }

  const [quota, used] = await Promise.all([
    getOrgMonthlySmsQuota(user.organizationId),
    getOrgMonthlySmsUsage(user.organizationId, at),
  ]);

  return {
    allowed: !isOverQuota(used, quota),
    used,
    quota,
    remaining: calcRemaining(used, quota),
    source: "organization",
  };
}

/**
 * Convenience: שילוב check + increment באטומיות לוגית.
 * אם over quota — לא מעלה ומחזיר allowed=false.
 *
 * NOTE: בין check ל-increment יש race condition קטן (window של ms). לטיפול
 * מלא: להעביר ל-stored procedure ב-DB. כרגע — סביר, כי SMS נשלחים בקצב נמוך.
 */
export async function consumeOrgSmsQuota(
  userId: string,
  amount: number = 1,
  at: Date = new Date()
): Promise<QuotaCheckResult & { consumed: boolean }> {
  const check = await checkSmsQuota(userId, at);

  if (check.source !== "organization") {
    return { ...check, consumed: false };
  }

  if (!check.allowed) {
    logger.warn("[sms-quota] Org over quota — refusing increment", {
      userId,
      used: check.used,
      quota: check.quota,
    });
    return { ...check, consumed: false };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  if (!user?.organizationId) {
    return { ...check, consumed: false };
  }

  const { smsCount } = await incrementOrgSmsUsage(user.organizationId, amount, at);

  return {
    allowed: true,
    used: smsCount,
    quota: check.quota,
    remaining: calcRemaining(smsCount, check.quota),
    source: "organization",
    consumed: true,
  };
}
