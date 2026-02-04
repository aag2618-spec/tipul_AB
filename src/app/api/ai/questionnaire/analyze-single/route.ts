import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";

// שימוש ב-Gemini 2.0 Flash בלבד
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");
const GEMINI_MODEL = "gemini-2.0-flash-exp";

// עלויות למיליון טוקנים
const COSTS_PER_1M_TOKENS = {
  input: 0.10,
  output: 0.40
};

/**
 * POST /api/ai/questionnaire/analyze-single
 * ניתוח שאלון בודד
 * 
 * תוכניות:
 * - ESSENTIAL: אין גישה
 * - PROFESSIONAL: עד 60 ניתוחים בחודש
 * - ENTERPRISE: עד 80 ניתוחים בחודש
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const { responseId } = await req.json();

    // קבלת פרטי המשתמש
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { aiUsageStats: true },
    });

    if (!user) {
      return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });
    }

    // תוכנית בסיסית - אין גישה
    if (user.aiTier === "ESSENTIAL") {
      return NextResponse.json(
        { 
          error: "תכונות AI אינן זמינות בתוכנית הבסיסית",
          upgradeLink: "/dashboard/settings/billing"
        },
        { status: 403 }
      );
    }

    // בדיקת מכסה חודשית
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

    // מגבלות לפי תוכנית
    const limits: Record<string, number> = {
      PRO: 60,
      ENTERPRISE: 80,
    };

    const currentCount = monthlyUsage?.singleQuestionnaireCount || 0;
    const limit = limits[user.aiTier as keyof typeof limits] || 0;

    if (currentCount >= limit) {
      return NextResponse.json(
        {
          error: `הגעת למכסה החודשית (${limit} ניתוחים). שדרג את התוכנית שלך לעוד ניתוחים.`,
        },
        { status: 429 }
      );
    }

    // קבלת תשובות השאלון
    const response = await prisma.questionnaireResponse.findUnique({
      where: { id: responseId },
      include: {
        template: true,
        client: true,
      },
    });

    if (!response) {
      return NextResponse.json(
        { error: "תשובות השאלון לא נמצאו" },
        { status: 404 }
      );
    }

    // וידוא בעלות
    if (response.therapistId !== user.id) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
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

    // קריאה ל-Gemini 2.0 Flash
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const analysis = result.response.text();

    // חישוב עלויות
    const estimatedInputTokens = Math.round(prompt.length / 4);
    const estimatedOutputTokens = Math.round(analysis.length / 4);
    const totalTokens = estimatedInputTokens + estimatedOutputTokens;
    
    const inputCost = (estimatedInputTokens / 1_000_000) * COSTS_PER_1M_TOKENS.input;
    const outputCost = (estimatedOutputTokens / 1_000_000) * COSTS_PER_1M_TOKENS.output;
    const cost = inputCost + outputCost;

    // שמירת הניתוח
    const savedAnalysis = await prisma.questionnaireAnalysis.create({
      data: {
        userId: user.id,
        clientId: response.clientId,
        analysisType: "SINGLE",
        responseId: response.id,
        content: analysis,
        aiModel: GEMINI_MODEL,
        tokensUsed: totalTokens,
        cost: cost,
      },
    });

    // עדכון סטטיסטיקות שימוש חודשיות
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
        totalTokens: totalTokens,
      },
      update: {
        singleQuestionnaireCount: { increment: 1 },
        totalCost: { increment: cost },
        totalTokens: { increment: totalTokens },
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
    console.error("שגיאה בניתוח שאלון:", error);
    return NextResponse.json(
      { error: "שגיאה בניתוח השאלון" },
      { status: 500 }
    );
  }
}
