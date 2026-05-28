import type { AITier } from "@prisma/client";

/**
 * M11.E1: ירושת aiTier מהארגון למשתמש בהצטרפות לקליניקה.
 *
 * סדר עדיפות לבחירת ה-tier הארגוני:
 *   1. CustomContract.customAiTier (אם החוזה פעיל — startDate<=now<endDate) גובר על pricingPlan.
 *   2. ClinicPricingPlan.aiTierIncluded.
 *   3. null — אין tier ארגוני; המשתמש שומר על ה-aiTier האישי שלו.
 *
 * נקודה חשובה: גם CustomContract.customAiTier=null משמעו "להשתמש ב-pricingPlan"
 * (לא "ביטול"). זה תואם לפרשנות של customSmsQuota בסכמה.
 *
 * תוקף חוזה: אם endDate בעבר ולא autoRenew — נופלים ל-pricingPlan. זה מונע
 * over-grant של tier אחרי שחוזה מותאם אישית פג. תואם להתנהגות של limits ו-SMS
 * (effective-price.isCustomContractActive). ה-cron של M11.E2 דואג לחדש חוזים
 * עם autoRenew=true אוטומטית — כאן אנחנו רק רואים את ה-snapshot של ה-DB.
 */
export function resolveOrgAiTier(
  org: {
    customContract?: {
      customAiTier: AITier | null;
      startDate?: Date | string | null;
      endDate?: Date | string | null;
      autoRenew?: boolean;
    } | null;
    pricingPlan?: { aiTierIncluded: AITier | null } | null;
  },
  now: Date = new Date()
): AITier | null {
  const contract = org.customContract;
  if (contract?.customAiTier) {
    const startDate = contract.startDate
      ? new Date(contract.startDate)
      : null;
    const endDate = contract.endDate ? new Date(contract.endDate) : null;

    const startedOk = !startDate || startDate.getTime() <= now.getTime();
    const notExpired =
      !endDate ||
      endDate.getTime() > now.getTime() ||
      contract.autoRenew === true;

    if (startedOk && notExpired) {
      return contract.customAiTier;
    }
  }
  return org.pricingPlan?.aiTierIncluded ?? null;
}

/**
 * דירוג הוא ordinal: ESSENTIAL=0, PRO=1, ENTERPRISE=2.
 * משמש להחלטה האם ירושה ארגונית היא שדרוג ביחס ל-tier האישי הקיים.
 */
const TIER_RANK: Record<AITier, number> = {
  ESSENTIAL: 0,
  PRO: 1,
  ENTERPRISE: 2,
};

export function compareAiTierRank(a: AITier, b: AITier): number {
  return TIER_RANK[a] - TIER_RANK[b];
}

/**
 * האם ה-tier הארגוני "טוב יותר" מה-tier האישי? משמש למשתמשים קיימים
 * כדי לא להוריד דרגה (downgrade) מקצועי שיש למשתמש לפני שהצטרף.
 */
export function isOrgTierUpgrade(
  personalTier: AITier,
  orgTier: AITier
): boolean {
  return compareAiTierRank(orgTier, personalTier) > 0;
}
