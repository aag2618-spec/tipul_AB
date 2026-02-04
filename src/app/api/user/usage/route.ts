import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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

const TIER_DISPLAY_NAMES = {
  ESSENTIAL: { he: "בסיסי", en: "Essential" },
  PRO: { he: "מקצועי", en: "Professional" },
  ENTERPRISE: { he: "ארגוני", en: "Enterprise" },
};

// GET - קבלת מידע על שימוש המשתמש
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user with tier
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        aiTier: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    const tier = user.aiTier;

    // Get tier limits from DB or use defaults
    let tierLimits = await prisma.tierLimits.findUnique({
      where: { tier },
    });

    if (!tierLimits) {
      tierLimits = {
        id: "default",
        tier,
        createdAt: new Date(),
        updatedAt: new Date(),
        displayNameHe: TIER_DISPLAY_NAMES[tier]?.he || tier,
        displayNameEn: TIER_DISPLAY_NAMES[tier]?.en || tier,
        priceMonthly: tier === "ESSENTIAL" ? 117 : tier === "PRO" ? 145 : 220,
        description: null,
        ...DEFAULT_LIMITS[tier],
      };
    }

    // Get current month usage
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    let monthlyUsage = await prisma.monthlyUsage.findUnique({
      where: {
        userId_month_year: {
          userId,
          month,
          year,
        },
      },
    });

    // If no usage record exists, create one
    if (!monthlyUsage) {
      monthlyUsage = {
        id: "new",
        userId,
        month,
        year,
        sessionPrepCount: 0,
        conciseAnalysisCount: 0,
        detailedAnalysisCount: 0,
        singleQuestionnaireCount: 0,
        combinedQuestionnaireCount: 0,
        progressReportCount: 0,
        totalCost: 0 as unknown as import("@prisma/client").Prisma.Decimal,
        totalTokens: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // Calculate percentages and remaining
    const calculateUsage = (used: number, limit: number) => {
      if (limit === -1) return { used, limit, remaining: 0, percentage: 0, blocked: true };
      if (limit === 0) return { used, limit, remaining: Infinity, percentage: 0, blocked: false };
      
      const remaining = Math.max(0, limit - used);
      const percentage = Math.min(100, Math.round((used / limit) * 100));
      return { used, limit, remaining, percentage, blocked: false };
    };

    const usage = {
      tier: {
        code: tier,
        displayName: tierLimits.displayNameHe,
        displayNameEn: tierLimits.displayNameEn,
        price: tierLimits.priceMonthly,
      },
      subscription: {
        status: user.subscriptionStatus,
        endsAt: user.subscriptionEndsAt,
      },
      month: `${month}/${year}`,
      features: {
        sessionPrep: calculateUsage(
          monthlyUsage.sessionPrepCount,
          tierLimits.sessionPrepLimit
        ),
        conciseAnalysis: calculateUsage(
          monthlyUsage.conciseAnalysisCount,
          tierLimits.conciseAnalysisLimit
        ),
        detailedAnalysis: calculateUsage(
          monthlyUsage.detailedAnalysisCount,
          tierLimits.detailedAnalysisLimit
        ),
        singleQuestionnaire: calculateUsage(
          monthlyUsage.singleQuestionnaireCount,
          tierLimits.singleQuestionnaireLimit
        ),
        combinedQuestionnaire: calculateUsage(
          monthlyUsage.combinedQuestionnaireCount,
          tierLimits.combinedQuestionnaireLimit
        ),
        progressReport: calculateUsage(
          monthlyUsage.progressReportCount,
          tierLimits.progressReportLimit
        ),
      },
      totals: {
        cost: Number(monthlyUsage.totalCost),
        tokens: monthlyUsage.totalTokens,
      },
    };

    return NextResponse.json(usage);
  } catch (error) {
    console.error("User usage GET error:", error);
    return NextResponse.json(
      { message: "שגיאה בטעינת נתוני השימוש" },
      { status: 500 }
    );
  }
}
