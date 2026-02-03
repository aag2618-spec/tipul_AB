import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApproachPrompts } from "@/lib/therapeutic-approaches";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

/**
 * POST /api/ai/session/analyze
 * Analyze a session (concise or detailed)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId, analysisType } = await req.json();

    // analysisType: "CONCISE" or "DETAILED"
    if (!["CONCISE", "DETAILED"].includes(analysisType)) {
      return NextResponse.json(
        { error: "Invalid analysis type" },
        { status: 400 }
      );
    }

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

    // DETAILED is only for Enterprise
    if (analysisType === "DETAILED" && user.aiTier !== "ENTERPRISE") {
      return NextResponse.json(
        { error: "Detailed analysis is only available in Enterprise plan" },
        { status: 403 }
      );
    }

    // Get current month usage (only for DETAILED)
    if (analysisType === "DETAILED") {
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

      const currentCount = monthlyUsage?.detailedAnalysisCount || 0;
      const limit = 10;

      if (currentCount >= limit) {
        return NextResponse.json(
          { error: `Monthly limit reached (${limit} detailed analyses)` },
          { status: 429 }
        );
      }
    }

    // Get session
    const therapySession = await prisma.therapySession.findUnique({
      where: { id: sessionId },
      include: {
        client: true,
        sessionNote: true,
      },
    });

    if (!therapySession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Verify ownership
    if (therapySession.therapistId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!therapySession.sessionNote) {
      return NextResponse.json(
        { error: "No session note found" },
        { status: 404 }
      );
    }

    // Check if analysis already exists
    const existingAnalysis = await prisma.sessionAnalysis.findUnique({
      where: { sessionId: sessionId },
    });

    if (existingAnalysis && existingAnalysis.analysisType === analysisType) {
      return NextResponse.json({
        success: true,
        analysis: existingAnalysis,
        cached: true,
      });
    }

    // Get therapeutic approaches for this client (or user default)
    const approaches =
      therapySession.client.therapeuticApproaches.length > 0
        ? therapySession.client.therapeuticApproaches
        : user.therapeuticApproaches;

    const approachPrompts = getApproachPrompts(approaches);

    // Prepare prompt
    let prompt: string;

    if (analysisType === "CONCISE") {
      prompt = `אתה פסיכולוג מומחה המנתח סיכום פגישה טיפולית.

מטופל: ${therapySession.client.name}
תאריך: ${therapySession.startTime.toLocaleDateString("he-IL")}
סוג פגישה: ${therapySession.type === "IN_PERSON" ? "פנים אל פנים" : therapySession.type === "ONLINE" ? "אונליין" : "טלפון"}

גישות טיפוליות שבהן אתה עובד:
${approachPrompts || "גישה אקלקטית"}

סיכום הפגישה:
${therapySession.sessionNote.content}

בצע ניתוח תמציתי ומקצועי (חצי עמוד, 200-300 מילים):

1. **סיכום מרכזי** (2-3 שורות)
   - מה עלה בפגישה?

2. **נושאים מרכזיים** (2-3 נקודות)
   - נושאים שעלו
   - דינמיקות בולטות

3. **רגשות דומיננטיים** (2-3 נקודות)
   - רגשות מרכזיים שהמטופל חווה
   - שינויים רגשיים בפגישה

4. **המלצות למפגש הבא** (2-3 נקודות)
   - מה חשוב להמשיך?
   - על מה לשים דגש?

כתוב בעברית, בסגנון מקצועי אך תמציתי.`;
    } else {
      // DETAILED
      prompt = `אתה פסיכולוג מומחה המנתח לעומק סיכום פגישה טיפולית.

מטופל: ${therapySession.client.name}
תאריך: ${therapySession.startTime.toLocaleDateString("he-IL")}
סוג פגישה: ${therapySession.type === "IN_PERSON" ? "פנים אל פנים" : therapySession.type === "ONLINE" ? "אונליין" : "טלפון"}

גישות טיפוליות שבהן אתה עובד:
${approachPrompts || "גישה אקלקטית"}

${therapySession.client.approachNotes ? `הערות על הגישה למטופל זה:\n${therapySession.client.approachNotes}\n` : ""}

סיכום הפגישה:
${therapySession.sessionNote.content}

בצע ניתוח מעמיק ברמה אקדמית (2-3 עמודים):

1. **סיכום הפגישה** (4-5 שורות)
   - סקירה מקיפה של מה שקרה

2. **ניתוח תוכן** (5-6 נקודות)
   - נושאים מרכזיים בפירוט
   - קונפליקטים פנימיים וחיצוניים
   - דפוסים חוזרים או חדשים

3. **ניתוח דינמיקות** (4-5 נקודות)
   - העברה (transference) - כיצד המטופל רואה אותך?
   - ניגוד-העברה (countertransference) - מה עלול להתעורר אצלך?
   - דפוסי יחסים שחוזרים על עצמם
   - מנגנוני הגנה בולטים

4. **ניתוח רגשי** (3-4 נקודות)
   - רגשות ראשוניים ומשניים
   - רגולציה רגשית
   - מעברים רגשיים

5. **ניתוח לפי הגישה הטיפולית** (4-5 נקודות)
   - איך הפגישה נראית דרך עדשת הגישה שלך?
   - מושגים מרכזיים מהגישה שרלוונטיים
   - תובנות ייחודיות

6. **התקדמות טיפולית** (3-4 נקודות)
   - מה השתנה מפגישות קודמות?
   - התקדמות לעבר יעדים
   - אתגרים והזדמנויות

7. **המלצות והמשך טיפול** (4-5 נקודות)
   - התערבויות מומלצות
   - טכניקות ספציפיות
   - מוקדים למפגשים הבאים
   - שיקולים לשינוי כיוון אם נדרש

כתוב בעברית, בסגנון אקדמי ומקצועי, עם עומק וניומנסים. זה ניתוח ברמה גבוהה!`;
    }

    let analysis: string;
    let aiModel: string;
    let estimatedTokens: number;
    let cost: number;

    if (analysisType === "CONCISE") {
      // Gemini Flash for concise
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      analysis = result.response.text();
      aiModel = "gemini-1.5-flash";
      estimatedTokens = Math.round((prompt.length + analysis.length) / 4);
      cost = (estimatedTokens / 1000) * 0.00015;
    } else {
      // GPT-4o for detailed
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });
      analysis = completion.choices[0].message.content || "";
      aiModel = "gpt-4o";
      estimatedTokens = completion.usage?.total_tokens || 0;
      cost = (estimatedTokens / 1000) * 0.015;
    }

    // Save or update analysis
    const savedAnalysis = await prisma.sessionAnalysis.upsert({
      where: { sessionId: sessionId },
      create: {
        userId: user.id,
        sessionId: sessionId,
        analysisType: analysisType,
        content: analysis,
        aiModel: aiModel,
        tokensUsed: Math.round(estimatedTokens),
        cost: cost,
      },
      update: {
        analysisType: analysisType,
        content: analysis,
        aiModel: aiModel,
        tokensUsed: Math.round(estimatedTokens),
        cost: cost,
      },
    });

    // Update monthly usage (only for detailed)
    if (analysisType === "DETAILED") {
      const now = new Date();
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
          detailedAnalysisCount: 1,
          totalCost: cost,
          totalTokens: Math.round(estimatedTokens),
        },
        update: {
          detailedAnalysisCount: { increment: 1 },
          totalCost: { increment: cost },
          totalTokens: { increment: Math.round(estimatedTokens) },
        },
      });
    } else {
      // Track concise analysis too (no limit, but track for stats)
      const now = new Date();
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
          conciseAnalysisCount: 1,
          totalCost: cost,
          totalTokens: Math.round(estimatedTokens),
        },
        update: {
          conciseAnalysisCount: { increment: 1 },
          totalCost: { increment: cost },
          totalTokens: { increment: Math.round(estimatedTokens) },
        },
      });
    }

    return NextResponse.json({
      success: true,
      analysis: savedAnalysis,
      cached: false,
    });
  } catch (error) {
    console.error("Error analyzing session:", error);
    return NextResponse.json(
      { error: "Failed to analyze session" },
      { status: 500 }
    );
  }
}
