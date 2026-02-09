import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApproachById, getApproachPrompts, buildIntegrationSection, getScalesPrompt, getUniversalPromptsLight } from "@/lib/therapeutic-approaches";

// שימוש ב-Gemini 2.0 Flash בלבד
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");
const GEMINI_MODEL = "gemini-2.0-flash";

// עלויות למיליון טוקנים
const COSTS_PER_1M_TOKENS = {
  input: 0.10,
  output: 0.40
};

/**
 * POST /api/ai/questionnaire/analyze-combined
 * ניתוח משולב של כל השאלונים של מטופל
 * 
 * תוכניות:
 * - ESSENTIAL: אין גישה
 * - PROFESSIONAL: עד 30 ניתוחים בחודש
 * - ENTERPRISE: עד 40 ניתוחים בחודש
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const { clientId } = await req.json();

    // קבלת פרטי המשתמש
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
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
      PRO: 30,
      ENTERPRISE: 40,
    };

    const currentCount = monthlyUsage?.combinedQuestionnaireCount || 0;
    const limit = limits[user.aiTier as keyof typeof limits] || 0;

    if (currentCount >= limit) {
      return NextResponse.json(
        {
          error: `הגעת למכסה החודשית (${limit} ניתוחים). שדרג את התוכנית שלך לעוד ניתוחים.`,
        },
        { status: 429 }
      );
    }

    // קבלת כל תשובות השאלונים של המטופל
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
        { error: "לא נמצאו שאלונים שהושלמו עבור מטופל זה" },
        { status: 404 }
      );
    }

    // קבלת פרטי המטופל
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        therapistId: true,
        therapeuticApproaches: true,
        approachNotes: true,
        culturalContext: true,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "מטופל לא נמצא" }, { status: 404 });
    }

    // הכנת סיכום השאלונים
    const questionnairesSummary = responses
      .map((r) => {
        return `
שאלון: ${r.template.name}
תאריך: ${r.completedAt?.toLocaleDateString("he-IL") || "לא זמין"}
ציון כולל: ${r.totalScore || "לא זמין"}
קטגוריה: ${r.template.category || "כללי"}
${r.subscores ? `ציוני משנה: ${JSON.stringify(r.subscores)}` : ""}
`;
      })
      .join("\n---\n");

    // קבלת גישות טיפוליות
    const therapeuticApproaches = (client.therapeuticApproaches && client.therapeuticApproaches.length > 0)
      ? client.therapeuticApproaches
      : (user.therapeuticApproaches || []);

    const approachNames = therapeuticApproaches
      .map(id => {
        const approach = getApproachById(id);
        return approach ? approach.nameHe : null;
      })
      .filter(Boolean)
      .join(", ");

    const approachPrompts = getApproachPrompts(therapeuticApproaches);
    const integrationSection = buildIntegrationSection(therapeuticApproaches);
    const scalesSection = getScalesPrompt(therapeuticApproaches);

    const approachSection = approachNames 
      ? `
=== גישות טיפוליות: ${approachNames} ===

${approachPrompts}

${integrationSection}
`
      : '';

    const culturalSection = client.culturalContext
      ? `\nהקשר תרבותי חשוב:\n${client.culturalContext}\nשים לב: אל תפרש תשובות שמשקפות נורמות תרבותיות כפתולוגיה.\n`
      : '';

    // בניית ה-prompt
    const prompt = `כללי פורמט (חובה):
- כתוב בעברית בלבד, מימין לשמאל
- מונחים מקצועיים: כתוב קודם בעברית, אנגלית בסוגריים. דוגמה: "הזדהות השלכתית (Projective Identification)"
- ללא Markdown: ללא #, ללא **, ללא *, ללא _
- כותרות: בשורה נפרדת עם נקודתיים
- רשימות: סימן • בלבד
- הפרדה: שורה ריקה בין סעיפים

הנחיה: תתעלם מהתשובה ה"מובנת מאליה" וחפש את הפרדוקס.
חפש סתירות בין שאלונים שונים - שם מתחבא המידע הקליני האמיתי.

אתה פסיכולוג קליני ברמה אקדמית גבוהה. בצע ניתוח משולב ברמה של פסיכולוג בכיר.
${approachSection}
${culturalSection}
פרטים:
• מטופל: ${client.name}
• מספר שאלונים: ${responses.length}

שאלונים שמולאו:
${questionnairesSummary}

בצע ניתוח מקיף ומשולב (500-700 מילים)${approachNames ? ` לפי ${approachNames}` : ''}:

1. תמונה קלינית כוללת:
• מה עולה מכלל השאלונים? איזו תמונה מתקבלת?
${approachNames ? `• פרשנות לפי ${approachNames}` : ''}
• מה ה"סיפור" שהמטופל מספר דרך הציונים?

2. סתירות ופרדוקסים בין שאלונים:
• פערים בין שאלונים שונים (למשל: חרדה נמוכה אבל דיכאון גבוה)
• מה הסתירות מלמדות על מנגנוני הגנה (מנגנון הגנה - Defense Mechanism)?
• מה שה"מספרים לא אומרים"

3. סימנים מחשידים (Red Flags):
• פריטים קריטיים שדורשים תשומת לב
• דפוסים מדאיגים בין שאלונים

4. נקודות חוזק ומשאבים:
• תחומים שבהם המטופל חזק
• משאבים פנימיים שניתן למנף בטיפול

5. אתגרים וסדר עדיפויות:
• מה הכי דחוף לטפל בו?
• סדר עדיפויות קליני מנומק

6. המלצות קליניות:
• מוקדי טיפול${approachNames ? ` בהתאם ל-${approachNames}` : ''}
• טכניקות ספציפיות
• שאלות שכדאי לשאול בפגישה הבאה
${scalesSection ? `\n7. הערכה כמותית:\n${scalesSection}` : ''}

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
        clientId: clientId,
        analysisType: "COMBINED",
        responseIds: responses.map((r) => r.id),
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
        combinedQuestionnaireCount: 1,
        totalCost: cost,
        totalTokens: totalTokens,
      },
      update: {
        combinedQuestionnaireCount: { increment: 1 },
        totalCost: { increment: cost },
        totalTokens: { increment: totalTokens },
      },
    });

    return NextResponse.json({
      success: true,
      analysis: savedAnalysis,
      model: GEMINI_MODEL,
      usage: {
        current: currentCount + 1,
        limit: limit,
        remaining: limit - currentCount - 1,
      },
    });
  } catch (error) {
    console.error("שגיאה בניתוח שאלונים משולבים:", error);
    return NextResponse.json(
      { error: "שגיאה בניתוח השאלונים" },
      { status: 500 }
    );
  }
}
