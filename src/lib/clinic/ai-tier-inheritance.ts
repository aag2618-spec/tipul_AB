import type { AITier } from "@prisma/client";

/**
 * M11.E1: ירושת aiTier מהארגון למשתמש בהצטרפות לקליניקה.
 *
 * סדר עדיפות לבחירת ה-tier הארגוני:
 *   1. CustomContract.customAiTier (אם החוזה פעיל — endDate>=now) גובר על pricingPlan.
 *   2. ClinicPricingPlan.aiTierIncluded.
 *   3. null — אין tier ארגוני; המשתמש שומר על ה-aiTier האישי שלו.
 *
 * נקודה חשובה: גם CustomContract.customAiTier=null משמעו "להשתמש ב-pricingPlan"
 * (לא "ביטול"). זה תואם לפרשנות של customSmsQuota בסכמה.
 *
 * תוקף חוזה: אם endDate בעבר ולא autoRenew — נופלים ל-pricingPlan. זה מונע
 * over-grant של tier אחרי שחוזה מותאם אישית פג. תואם להתנהגות של limits ו-SMS.
 */
export function resolveOrgAiTier(
  org: {
    customContract?: {
      customAiTier: AITier | null;
      endDate?: Date | string | null;
      autoRenew?: boolean;
    } | null;
    pricingPlan?: { aiTierIncluded: AITier | null } | null;
  },
  now: Date = new Date()
): AITier | null {
  const contract = org.customContract;
  if (contract?.customAiTier) {
    // חוזה ללא endDate (defensive) או autoRenew — נחשב כפעיל.
    const endDate = contract.endDate ? new Date(contract.endDate) : null;
    const isActive =
      !endDate || endDate.getTime() >= now.getTime() || contract.autoRenew === true;
    if (isActive) {
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
