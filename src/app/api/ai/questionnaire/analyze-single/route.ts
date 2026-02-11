import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApproachById, getApproachPrompts, buildIntegrationSection, getScalesPrompt, getUniversalPromptsLight } from "@/lib/therapeutic-approaches";
import { checkTrialAiLimit, updateTrialAiCost } from "@/lib/trial-limits";

// שימוש ב-Gemini 2.0 Flash בלבד
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");
const GEMINI_MODEL = "gemini-2.0-flash";

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

    // בדיקת מגבלות ניסיון
    const trialCheck = await checkTrialAiLimit(session.user.id);
    if (!trialCheck.allowed) {
      return NextResponse.json(
        { error: trialCheck.message, upgradeLink: "/dashboard/settings/billing", trialLimitReached: true },
        { status: 429 }
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
        client: {
          select: {
            id: true,
            name: true,
            birthDate: true,
            therapeuticApproaches: true,
            approachNotes: true,
            culturalContext: true,
          }
        },
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

    // קבלת גישות טיפוליות
    let approachNames = '';
    let approachSection = '';
    let integrationSection = '';
    let scalesSection = '';
    let culturalSection = '';
    const clientCulturalContext = response.client?.culturalContext || null;
    
    if (user.aiTier === 'ENTERPRISE') {
      const therapeuticApproaches = (response.client?.therapeuticApproaches && response.client.therapeuticApproaches.length > 0)
        ? response.client.therapeuticApproaches
        : (user.therapeuticApproaches || []);

      approachNames = therapeuticApproaches
        .map(id => {
          const approach = getApproachById(id);
          return approach ? approach.nameHe : null;
        })
        .filter(Boolean)
        .join(", ");

      if (therapeuticApproaches.length > 0) {
        const approachPrompts = getApproachPrompts(therapeuticApproaches);
        integrationSection = buildIntegrationSection(therapeuticApproaches);
        scalesSection = getScalesPrompt(therapeuticApproaches);

        approachSection = `
=== גישות טיפוליות: ${approachNames} ===

${approachPrompts}

${integrationSection}
`;
      }
    }

    if (clientCulturalContext) {
      culturalSection = `
הקשר תרבותי חשוב:
${clientCulturalContext}
שים לב: אל תפרש תשובות שמשקפות נורמות תרבותיות כפתולוגיה. התאם את הפרשנות בהתאם.
`;
    }

    // Prepare prompt
    const prompt = `כללי פורמט (חובה):
- כתוב בעברית בלבד, מימין לשמאל
- מונחים מקצועיים: כתוב קודם בעברית, אנגלית בסוגריים. דוגמה: "פיצול (Splitting)"
- ללא Markdown: ללא #, ללא **, ללא *, ללא _
- כותרות: בשורה נפרדת עם נקודתיים
- רשימות: סימן • בלבד
- הפרדה: שורה ריקה בין סעיפים

הנחיה: תתעלם מהתשובה ה"מובנת מאליה" וחפש את הפרדוקס.
לדוגמה: מטופל שמדווח על חרדה נמוכה אבל הדיכאון גבוה - האם החרדה מוסווית?

אתה פסיכולוג קליני ברמה אקדמית גבוהה. נתח את תוצאות השאלון ברמה של פסיכולוג בכיר.
${approachSection}
${culturalSection}
שאלון: ${response.template.name} (${response.template.nameEn || ""})
קטגוריה: ${response.template.category || "כללי"}
תאריך מילוי: ${response.completedAt?.toLocaleDateString("he-IL") || "לא הושלם"}
מטופל: ${response.client?.name || "לא ידוע"}

תוצאות:
ציון כולל: ${response.totalScore || "N/A"}
תשובות: ${JSON.stringify(response.answers)}
${response.subscores ? `ציוני משנה: ${JSON.stringify(response.subscores)}` : ""}

בצע ניתוח קליני מעמיק${approachNames ? ` לפי ${approachNames}` : ''}:

1. פרשנות קלינית:
• משמעות הציון הכולל (טווח: נורמלי/קל/בינוני/חמור)
• מה הציון אומר *באמת* - לא רק המספר
${approachNames ? `• פרשנות לפי ${approachNames} - איך הגישה מסבירה את הדפוס` : ''}

2. סימנים מחשידים (Red Flags):
• תשובות שדורשות תשומת לב מיוחדת
• סתירות בתשובות (למשל: מדווח על מצב רוח טוב אבל שינה מופרעת)
• פריטים קריטיים (סיכון, פגיעה עצמית)

3. דפוסים ותובנות:
• דפוסים בולטים בתשובות${approachNames ? ` (דרך העדשה של ${approachNames})` : ''}
• מה המטופל *לא* אומר - חסרים בולטים
• קשר בין תחומים שונים בשאלון

4. נקודות חוזק:
• תחומים חזקים שניתן לבנות עליהם
• משאבים פנימיים שעולים מהתשובות

5. המלצות קליניות:
• המלצות קונקרטיות למטפל${approachNames ? ` בהתאם ל-${approachNames}` : ''}
• טכניקות ספציפיות מומלצות
• שאלות שכדאי לשאול בפגישה הבאה
${scalesSection ? `\n6. הערכה כמותית:\n${scalesSection}` : ''}

כל מונח אנגלי חייב להופיע עם תרגום פשוט בעברית.

${getUniversalPromptsLight()}`;

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

    // עדכון עלות ניסיון
    await updateTrialAiCost(session.user.id, cost);

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
