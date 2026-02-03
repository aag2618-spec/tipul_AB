import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/ai/usage
 * Get current month AI usage stats and limits
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get current month usage
    const now = new Date();
    const monthlyUsage = await prisma.monthlyUsage.findUnique({
      where: {
        userId_month_year: {
          userId: user.id,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
      },
    });

    // Define limits based on plan
    const limits = {
      ESSENTIAL: {
        detailedAnalysis: 0,
        singleQuestionnaire: 0,
        combinedQuestionnaire: 0,
        progressReport: 0,
      },
      PRO: {
        detailedAnalysis: 0, // Not available
        singleQuestionnaire: 60,
        combinedQuestionnaire: 30,
        progressReport: 15,
      },
      ENTERPRISE: {
        detailedAnalysis: 10,
        singleQuestionnaire: 80,
        combinedQuestionnaire: 40,
        progressReport: 20,
      },
    };

    const planLimits = limits[user.aiTier as keyof typeof limits] || limits.ESSENTIAL;

    // Current usage
    const usage = {
      // Session Prep (no limit, auto-generated)
      sessionPrep: monthlyUsage?.sessionPrepCount || 0,

      // Session Analysis
      conciseAnalysis: monthlyUsage?.conciseAnalysisCount || 0,
      conciseAnalysisLimit: null, // Unlimited (1 per session)

      detailedAnalysis: monthlyUsage?.detailedAnalysisCount || 0,
      detailedAnalysisLimit: planLimits.detailedAnalysis,
      detailedAnalysisRemaining:
        planLimits.detailedAnalysis - (monthlyUsage?.detailedAnalysisCount || 0),

      // Questionnaire Analysis
      singleQuestionnaire: monthlyUsage?.singleQuestionnaireCount || 0,
      singleQuestionnaireLimit: planLimits.singleQuestionnaire,
      singleQuestionnaireRemaining:
        planLimits.singleQuestionnaire - (monthlyUsage?.singleQuestionnaireCount || 0),

      combinedQuestionnaire: monthlyUsage?.combinedQuestionnaireCount || 0,
      combinedQuestionnaireLimit: planLimits.combinedQuestionnaire,
      combinedQuestionnaireRemaining:
        planLimits.combinedQuestionnaire -
        (monthlyUsage?.combinedQuestionnaireCount || 0),

      progressReport: monthlyUsage?.progressReportCount || 0,
      progressReportLimit: planLimits.progressReport,
      progressReportRemaining:
        planLimits.progressReport - (monthlyUsage?.progressReportCount || 0),

      // Totals
      totalCost: monthlyUsage?.totalCost || 0,
      totalTokens: monthlyUsage?.totalTokens || 0,
    };

    return NextResponse.json({
      success: true,
      plan: user.aiTier,
      usage: usage,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    });
  } catch (error) {
    console.error("Error fetching AI usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI usage" },
      { status: 500 }
    );
  }
}
