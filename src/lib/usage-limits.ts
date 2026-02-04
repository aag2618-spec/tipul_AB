import prisma from "@/lib/prisma";

// ברירות מחדל למכסות
const DEFAULT_LIMITS = {
  ESSENTIAL: {
    sessionPrepLimit: -1,
    conciseAnalysisLimit: -1,
    detailedAnalysisLimit: -1,
    singleQuestionnaireLimit: -1,
    combinedQuestionnaireLimit: -1,
    progressReportLimit: -1,
  },
  PRO: {
    sessionPrepLimit: 200,
    conciseAnalysisLimit: 100,
    detailedAnalysisLimit: -1,
    singleQuestionnaireLimit: 60,
    combinedQuestionnaireLimit: 30,
    progressReportLimit: 15,
  },
  ENTERPRISE: {
    sessionPrepLimit: 400,
    conciseAnalysisLimit: 150,
    detailedAnalysisLimit: 50,
    singleQuestionnaireLimit: 80,
    combinedQuestionnaireLimit: 40,
    progressReportLimit: 20,
  },
};

type AITier = "ESSENTIAL" | "PRO" | "ENTERPRISE";
type FeatureType = 
  | "sessionPrep" 
  | "conciseAnalysis" 
  | "detailedAnalysis"
  | "singleQuestionnaire"
  | "combinedQuestionnaire"
  | "progressReport";

interface UsageCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  remaining: number;
  percentage: number;
  isBlocked: boolean;
  message?: string;
}

/**
 * בדיקה האם המשתמש יכול להשתמש בפיצ'ר מסוים
 */
export async function checkUsageLimit(
  userId: string,
  feature: FeatureType
): Promise<UsageCheckResult> {
  // Get user tier
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiTier: true },
  });

  if (!user) {
    return {
      allowed: false,
      currentUsage: 0,
      limit: 0,
      remaining: 0,
      percentage: 0,
      isBlocked: true,
      message: "משתמש לא נמצא",
    };
  }

  const tier = user.aiTier as AITier;

  // Get tier limits from DB or use defaults
  let tierLimits = await prisma.tierLimits.findUnique({
    where: { tier },
  });

  const limits = tierLimits || DEFAULT_LIMITS[tier];
  const limitField = `${feature}Limit` as keyof typeof limits;
  const limit = (limits as Record<string, number>)[limitField] ?? -1;

  // If blocked (-1), return immediately
  if (limit === -1) {
    return {
      allowed: false,
      currentUsage: 0,
      limit: -1,
      remaining: 0,
      percentage: 0,
      isBlocked: true,
      message: `פיצ'ר זה לא זמין בתוכנית ${getTierDisplayName(tier)}. שדרג לתוכנית גבוהה יותר.`,
    };
  }

  // If unlimited (0), always allow
  if (limit === 0) {
    return {
      allowed: true,
      currentUsage: 0,
      limit: 0,
      remaining: Infinity,
      percentage: 0,
      isBlocked: false,
    };
  }

  // Get current month usage
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  let monthlyUsage = await prisma.monthlyUsage.findUnique({
    where: {
      userId_month_year: { userId, month, year },
    },
  });

  // Create if doesn't exist
  if (!monthlyUsage) {
    monthlyUsage = await prisma.monthlyUsage.create({
      data: { userId, month, year },
    });
  }

  const usageField = `${feature}Count` as keyof typeof monthlyUsage;
  const currentUsage = (monthlyUsage as Record<string, number>)[usageField] ?? 0;
  const remaining = Math.max(0, limit - currentUsage);
  const percentage = Math.round((currentUsage / limit) * 100);

  if (currentUsage >= limit) {
    return {
      allowed: false,
      currentUsage,
      limit,
      remaining: 0,
      percentage: 100,
      isBlocked: false,
      message: `הגעת למכסה החודשית (${limit}). המכסה תתחדש בתחילת החודש הבא.`,
    };
  }

  return {
    allowed: true,
    currentUsage,
    limit,
    remaining,
    percentage,
    isBlocked: false,
  };
}

/**
 * הגדלת מונה השימוש לאחר שימוש מוצלח
 */
export async function incrementUsage(
  userId: string,
  feature: FeatureType,
  tokensUsed?: number,
  cost?: number
): Promise<void> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const usageField = `${feature}Count`;

  await prisma.monthlyUsage.upsert({
    where: {
      userId_month_year: { userId, month, year },
    },
    create: {
      userId,
      month,
      year,
      [usageField]: 1,
      totalTokens: tokensUsed || 0,
      totalCost: cost || 0,
    },
    update: {
      [usageField]: { increment: 1 },
      totalTokens: { increment: tokensUsed || 0 },
      totalCost: { increment: cost || 0 },
    },
  });
}

/**
 * קבלת שם התוכנית בעברית
 */
export function getTierDisplayName(tier: AITier): string {
  const names = {
    ESSENTIAL: "בסיסי",
    PRO: "מקצועי",
    ENTERPRISE: "ארגוני",
  };
  return names[tier] || tier;
}

/**
 * בדיקה האם התוכנית תומכת בפיצ'ר
 */
export function isFeatureAvailable(tier: AITier, feature: FeatureType): boolean {
  const limits = DEFAULT_LIMITS[tier];
  const limitField = `${feature}Limit` as keyof typeof limits;
  return limits[limitField] !== -1;
}

/**
 * קבלת כל המכסות לתוכנית
 */
export async function getTierLimits(tier: AITier) {
  const tierLimits = await prisma.tierLimits.findUnique({
    where: { tier },
  });

  return tierLimits || {
    tier,
    ...DEFAULT_LIMITS[tier],
    displayNameHe: getTierDisplayName(tier),
    displayNameEn: tier,
    priceMonthly: tier === "ESSENTIAL" ? 117 : tier === "PRO" ? 145 : 220,
  };
}
