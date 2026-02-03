import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

/**
 * POST /api/ai/questionnaire/analyze-combined
 * Analyze all questionnaires for a client
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientId } = await req.json();

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
      PRO: 30,
      ENTERPRISE: 40,
    };

    const currentCount = monthlyUsage?.combinedQuestionnaireCount || 0;
    const limit = limits[user.aiTier as keyof typeof limits] || 0;

    if (currentCount >= limit) {
      return NextResponse.json(
        {
          error: `Monthly limit reached (${limit}). Upgrade your plan for more analyses.`,
        },
        { status: 429 }
      );
    }

    // Get all questionnaire responses for client
    const responses = await prisma.questionnaireResponse.findMany({
      where: {
        clientId: clientId,
        therapistId: user.id,
        status: "COMPLETED",
      },
      include: {
        template: true,
      },
      orderBy: {
        completedAt: "desc",
      },
    });

    if (responses.length === 0) {
      return NextResponse.json(
        { error: "No completed questionnaires found for this client" },
        { status: 404 }
      );
    }

    // Get client info
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Prepare questionnaires summary
    const questionnairesSummary = responses
      .map((r) => {
        return `
שאלון: ${r.template.name} (${r.template.nameEn || ""})
תאריך: ${r.completedAt?.toLocaleDateString("he-IL") || "N/A"}
ציון כולל: ${r.totalScore || "N/A"}
קטגוריה: ${r.template.category || "כללי"}
${r.subscores ? `ציוני משנה: ${JSON.stringify(r.subscores)}` : ""}
`;
      })
      .join("\n---\n");

    // Prepare prompt
    const prompt = `אתה פסיכולוג מומחה המנתח סט מלא של שאלונים למטופל אחד.

מטופל: ${client.name}
מספר שאלונים: ${responses.length}

שאלונים שמולאו:
${questionnairesSummary}

בצע ניתוח מקיף ומשולב:

1. **תמונה קלינית כוללת** (3-4 שורות)
   - מה עולה מכלל השאלונים?
   - איזו תמונה קלינית מתקבלת?

2. **דפוסים משמעותיים** (3-4 נקודות)
   - דפוסים בולטים בין שאלונים שונים
   - קשרים והשלמה בין התוצאות
   - תחומים בולטים (דיכאון, חרדה, טראומה, וכו')

3. **נקודות חוזק ואתגרים** (2-3 נקודות כל אחד)
   - תחומים שבהם המטופל מתפקד טוב
   - תחומים הדורשים התערבות

4. **המלצות טיפוליות** (3-4 נקודות)
   - מוקדי טיפול מומלצים
   - טכניקות והתערבויות ספציפיות
   - סדר עדיפויות

כתוב בעברית, בסגנון מקצועי ומעמיק.`;

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
      cost = (estimatedTokens / 1000) * 0.015; // $0.015 per 1K tokens for GPT-4o
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
        analysisType: "COMBINED",
        responseIds: responses.map((r) => r.id),
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
        combinedQuestionnaireCount: 1,
        totalCost: cost,
        totalTokens: Math.round(estimatedTokens),
      },
      update: {
        combinedQuestionnaireCount: { increment: 1 },
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
    console.error("Error analyzing combined questionnaires:", error);
    return NextResponse.json(
      { error: "Failed to analyze questionnaires" },
      { status: 500 }
    );
  }
}
