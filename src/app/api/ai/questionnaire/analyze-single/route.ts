import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

/**
 * POST /api/ai/questionnaire/analyze-single
 * Analyze a single questionnaire response
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { responseId } = await req.json();

    // Get user and check plan
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { aiUsageStats: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user has AI enabled
    if (user.aiTier === "ESSENTIAL") {
      return NextResponse.json(
        { error: "AI features not available in Essential plan" },
        { status: 403 }
      );
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

    // Check limits
    const limits = {
      PRO: 60,
      ENTERPRISE: 80,
    };

    const currentCount = monthlyUsage?.singleQuestionnaireCount || 0;
    const limit = limits[user.aiTier as keyof typeof limits] || 0;

    if (currentCount >= limit) {
      return NextResponse.json(
        {
          error: `Monthly limit reached (${limit}). Upgrade your plan for more analyses.`,
        },
        { status: 429 }
      );
    }

    // Get questionnaire response
    const response = await prisma.questionnaireResponse.findUnique({
      where: { id: responseId },
      include: {
        template: true,
        client: true,
      },
    });

    if (!response) {
      return NextResponse.json(
        { error: "Response not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (response.therapistId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Prepare prompt
    const prompt = `אתה פסיכולוג מומחה המנתח תוצאות שאלונים.

שאלון: ${response.template.name} (${response.template.nameEn || ""})
קטגוריה: ${response.template.category || "כללי"}
תאריך מילוי: ${response.completedAt?.toLocaleDateString("he-IL") || "לא הושלם"}

תוצאות:
ציון כולל: ${response.totalScore || "N/A"}
תשובות: ${JSON.stringify(response.answers)}
${response.subscores ? `ציוני משנה: ${JSON.stringify(response.subscores)}` : ""}

בצע ניתוח מקצועי וממוקד:

1. **פירוש התוצאות** (2-3 שורות)
   - מה משמעות הציון?
   - האם בטווח נורמלי/קל/בינוני/חמור?

2. **נקודות מרכזיות** (3-4 נקודות)
   - ממצאים חשובים בתשובות
   - דפוסים בולטים

3. **המלצות טיפוליות** (2-3 נקודות)
   - המלצות קונקרטיות למטפל
   - טכניקות מומלצות

כתוב בעברית, בסגנון מקצועי אך ברור.`;

    // Generate analysis using Gemini (cheap for single questionnaire)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const analysis = result.response.text();

    // Calculate cost (Gemini Flash: ~0.00015 per 1K tokens)
    const estimatedTokens = prompt.length / 4 + analysis.length / 4;
    const cost = (estimatedTokens / 1000) * 0.00015;

    // Save analysis
    const savedAnalysis = await prisma.questionnaireAnalysis.create({
      data: {
        userId: user.id,
        clientId: response.clientId,
        analysisType: "SINGLE",
        responseId: response.id,
        content: analysis,
        aiModel: "gemini-1.5-flash",
        tokensUsed: Math.round(estimatedTokens),
        cost: cost,
      },
    });

    // Update monthly usage
    await prisma.monthlyUsage.upsert({
      where: {
        userId_month_year: {
          userId: user.id,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
      },
      create: {
        userId: user.id,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        singleQuestionnaireCount: 1,
        totalCost: cost,
        totalTokens: Math.round(estimatedTokens),
      },
      update: {
        singleQuestionnaireCount: { increment: 1 },
        totalCost: { increment: cost },
        totalTokens: { increment: Math.round(estimatedTokens) },
      },
    });

    return NextResponse.json({
      success: true,
      analysis: savedAnalysis,
      usage: {
        current: currentCount + 1,
        limit: limit,
        remaining: limit - currentCount - 1,
      },
    });
  } catch (error) {
    console.error("Error analyzing questionnaire:", error);
    return NextResponse.json(
      { error: "Failed to analyze questionnaire" },
      { status: 500 }
    );
  }
}
