import prisma from "@/lib/prisma";
import { getCurrentUsageKey } from "@/lib/date-utils";
import type { AITier as PrismaAITier, Role } from "@prisma/client";

// ברירות מחדל למכסות.
// הסמנטיקה: -1 = חסום (פיצ'ר לא זמין), 0 = ללא הגבלה, N>0 = מכסה חודשית.
// `satisfies TierFeatureLimits` למטה מבטיח שעדכון ל-interface יתפוס כאן באמת.
//
// ⚠️ Drift warning: הערכים האלה משוכפלים ב-`src/app/api/admin/tier-limits/route.ts`
// (DEFAULT_LIMITS שם, עם metadata של displayName/priceMonthly). אם משנים מספר
// כאן — לעדכן גם שם. רefactor עתידי: לאחד ב-`src/lib/defaults.ts`.
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
} as const;

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

  // Get current month usage — uses Israel timezone to match calendar month
  const { month, year } = getCurrentUsageKey();

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

  const usageField = `${feature}Count`;
  const currentUsage = (monthlyUsage as unknown as Record<string, number>)[usageField] ?? 0;
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
  // Uses Israel timezone to match calendar month
  const { month, year } = getCurrentUsageKey();

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
 * Stage 1.17.4: מכסות לפיצ'ר ספציפי, מהDB עם fallback ל-DEFAULT_LIMITS.
 * סמנטיקה: -1 = חסום, 0 = ללא הגבלה, N>0 = מכסה חודשית.
 */
export interface TierFeatureLimits {
  sessionPrepLimit: number;
  conciseAnalysisLimit: number;
  detailedAnalysisLimit: number;
  singleQuestionnaireLimit: number;
  combinedQuestionnaireLimit: number;
  progressReportLimit: number;
}

/**
 * קבלת מכסות הפיצ'רים לתוכנית — נקרא ל-DB דרך `prisma.tierLimits`,
 * עם fallback ל-DEFAULT_LIMITS אם הרשומה חסרה (boot-strap או מצב חירום).
 *
 * חשוב: זו הפונקציה היחידה שצריכה להיקרא מ-routes שאוכפים מכסות.
 * אסור hardcode של מספרים ב-routes — לא יכובד `/admin/tier-settings`.
 *
 * הערה על types: מקבל `PrismaAITier` ישירות (מהsכמה) במקום string union ידני.
 * אם יוסיפו tier רביעי לסכמה, TypeScript יתפוס את החוסר ב-DEFAULT_LIMITS דרך
 * ה-runtime guard למטה (זריקה מפורשת במקום undefined שקט).
 */
export async function getTierLimits(tier: PrismaAITier): Promise<TierFeatureLimits> {
  const tierLimits = await prisma.tierLimits.findUnique({
    where: { tier },
    select: {
      sessionPrepLimit: true,
      conciseAnalysisLimit: true,
      detailedAnalysisLimit: true,
      singleQuestionnaireLimit: true,
      combinedQuestionnaireLimit: true,
      progressReportLimit: true,
    },
  });

  // Runtime guard: אם הוסיפו tier חדש לסכמה אבל לא ל-DEFAULT_LIMITS, ניזרק
  // במקום להחזיר undefined שקט שיגרום לחישובי limit שגויים אצל ה-callers.
  if (!(tier in DEFAULT_LIMITS)) {
    throw new Error(`[usage-limits] Missing DEFAULT_LIMITS entry for tier: ${tier}`);
  }

  // satisfies מאלץ ש-DEFAULT_LIMITS יכלול בדיוק את כל השדות שמופיעים ב-interface.
  const defaults: TierFeatureLimits = DEFAULT_LIMITS[tier] satisfies TierFeatureLimits;
  return tierLimits ?? defaults;
}

/**
 * Stage 1.17.4 (סבב 3): bypass של כל מגבלות ה-AI לאדמין/מזכיר.
 *
 * ADMIN ו-MANAGER מקבלים גישה ללא הגבלה לכל פיצ'רי ה-AI ללא תלות ב:
 *   - tier (גם אם הם ESSENTIAL — לא ייחסם)
 *   - מצב ניסיון (`subscriptionStatus === "TRIALING"` + ₪5 cap)
 *   - מכסה חודשית (`/admin/tier-settings`)
 *   - rate-limit גלובלי (`GlobalAISettings`)
 *
 * USER (כולל TRIALING ו-`isFreeSubscription === true`) ממשיכים לעבור את
 * כל ה-gates הרגילים לפי ה-tier שלהם.
 *
 * חשוב: counters של שימוש ועלויות (`MonthlyUsage`, `aIUsageStats`,
 * `trialAiUsedCost`) ממשיכים להתעדכן גם ל-staff — bypass של אכיפה,
 * לא bypass של tracking. זה משאיר נראות אנליטית למי שמבצע קריאות.
 */
export function isStaff(role: Role): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
