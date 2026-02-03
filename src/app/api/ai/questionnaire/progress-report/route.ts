import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

/**
 * POST /api/ai/questionnaire/progress-report
 * Generate monthly progress report combining questionnaires and session summaries
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientId, dateFrom, dateTo } = await req.json();

    // Get user and check plan
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

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
      PRO: 15,
      ENTERPRISE: 20,
    };

    const currentCount = monthlyUsage?.progressReportCount || 0;
    const limit = limits[user.aiTier as keyof typeof limits] || 0;

    if (currentCount >= limit) {
      return NextResponse.json(
        {
          error: `Monthly limit reached (${limit}). Upgrade your plan for more reports.`,
        },
        { status: 429 }
      );
    }

    // Parse dates
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);

    // Get client info
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client || client.therapistId !== user.id) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Get questionnaires in date range
    const questionnaires = await prisma.questionnaireResponse.findMany({
      where: {
        clientId: clientId,
        therapistId: user.id,
        status: "COMPLETED",
        completedAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        template: true,
      },
      orderBy: {
        completedAt: "asc",
      },
    });

    // Get sessions in date range
    const sessions = await prisma.therapySession.findMany({
      where: {
        clientId: clientId,
        therapistId: user.id,
        status: "COMPLETED",
        startTime: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        sessionNote: true,
      },
      orderBy: {
        startTime: "asc",
      },
    });

    if (questionnaires.length === 0 && sessions.length === 0) {
      return NextResponse.json(
        { error: "No data found in the specified date range" },
        { status: 404 }
      );
    }

    // Prepare questionnaires summary
    const questionnairesSummary = questionnaires
      .map((r) => {
        return `${r.completedAt?.toLocaleDateString("he-IL")}: ${r.template.name} - ציון: ${r.totalScore || "N/A"}`;
      })
      .join("\n");

    // Prepare sessions summary
    const sessionsSummary = sessions
      .map((s) => {
        return `${s.startTime.toLocaleDateString("he-IL")}: ${s.sessionNote?.content?.substring(0, 200) || "אין סיכום"}...`;
      })
      .join("\n\n");

    // Prepare prompt
    const prompt = `אתה פסיכולוג מומחה המכין דו"ח התקדמות מקיף למטופל.

מטופל: ${client.name}
תקופה: ${fromDate.toLocaleDateString("he-IL")} - ${toDate.toLocaleDateString("he-IL")}
מספר פגישות: ${sessions.length}
מספר שאלונים: ${questionnaires.length}

שאלונים שמולאו:
${questionnairesSummary || "אין שאלונים בתקופה זו"}

סיכומי פגישות:
${sessionsSummary || "אין סיכומי פגישות"}

בצע ניתוח מקיף של ההתקדמות:

1. **סיכום ביצועים** (2-3 שורות)
   - כמה פגישות? כמה שאלונים?
   - רמת מעורבות והתמדה

2. **התקדמות בשאלונים** (3-4 נקודות)
   - שינויים בציונים לאורך זמן
   - מגמות (שיפור/החמרה/יציבות)
   - תחומים שהשתפרו/החמירו

3. **תובנות מסיכומי פגישות** (3-4 נקודות)
   - נושאים מרכזיים שעלו
   - דפוסים חוזרים
   - שינויים בדינמיקה הטיפולית

4. **ניתוח התקדמות משולב** (3-4 נקודות)
   - קשרים בין שאלונים לפגישות
   - התאמה/אי-התאמה בין מדדים אובייקטיביים לחוויה הסובייקטיבית
   - יעדים שהושגו

5. **המלצות להמשך טיפול** (3-4 נקודות)
   - המשך דרך נוכחית או שינוי כיוון?
   - מוקדים לתקופה הבאה
   - יעדים להמשך

כתוב בעברית, בסגנון מקצועי ומעמיק. זה דו"ח חשוב!`;

    let analysis: string;
    let aiModel: string;
    let estimatedTokens: number;
    let cost: number;

    // Enterprise uses GPT-4o, Pro uses Gemini
    if (user.aiTier === "ENTERPRISE") {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });
      analysis = completion.choices[0].message.content || "";
      aiModel = "gpt-4o";
      estimatedTokens = completion.usage?.total_tokens || 0;
      cost = (estimatedTokens / 1000) * 0.015;
    } else {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      analysis = result.response.text();
      aiModel = "gemini-1.5-flash";
      estimatedTokens = Math.round((prompt.length + analysis.length) / 4);
      cost = (estimatedTokens / 1000) * 0.00015;
    }

    // Save analysis
    const savedAnalysis = await prisma.questionnaireAnalysis.create({
      data: {
        userId: user.id,
        clientId: clientId,
        analysisType: "PROGRESS_REPORT",
        responseIds: questionnaires.map((r) => r.id),
        sessionIds: sessions.map((s) => s.id),
        dateFrom: fromDate,
        dateTo: toDate,
        content: analysis,
        aiModel: aiModel,
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
        progressReportCount: 1,
        totalCost: cost,
        totalTokens: Math.round(estimatedTokens),
      },
      update: {
        progressReportCount: { increment: 1 },
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
    console.error("Error generating progress report:", error);
    return NextResponse.json(
      { error: "Failed to generate progress report" },
      { status: 500 }
    );
  }
}
