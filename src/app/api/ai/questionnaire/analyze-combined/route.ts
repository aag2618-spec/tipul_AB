import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApproachById } from "@/lib/therapeutic-approaches";

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

    // קבלת גישות טיפוליות (של המטופל או ברירת מחדל)
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

    const approachSection = approachNames 
      ? `גישות טיפוליות: ${approachNames}
חשוב: נתח את כל השאלונים דרך עדשת הגישות הטיפוליות שהוגדרו. השתמש במושגים ובמסגרת התיאורטית של גישות אלו.

`
      : '';

    // בניית ה-prompt
    const prompt = `חשוב מאוד - כללי פורמט (חובה לציית):
- כתוב טקסט רגיל בלבד, ללא שום עיצוב
- אסור להשתמש ב-Markdown: ללא #, ללא **, ללא *, ללא _
- לכותרות: כתוב את הכותרת בשורה נפרדת עם נקודתיים בסוף
- לרשימות: השתמש בסימן • בלבד
- להפרדה: שורה ריקה בין סעיפים

אתה פסיכולוג מומחה המנתח סט מלא של שאלונים למטופל אחד.
${approachSection}
פרטים:
• מטופל: ${client.name}
• מספר שאלונים: ${responses.length}

שאלונים שמולאו:
${questionnairesSummary}

הנחיות:
בצע ניתוח מקיף ומשולב (400-500 מילים)${approachNames ? ` לפי גישות: ${approachNames}` : ''}.

מבנה התשובה:

1. תמונה קלינית כוללת:
(3-4 שורות - מה עולה מכלל השאלונים? איזו תמונה קלינית מתקבלת?${approachNames ? ` נתח לפי ${approachNames}` : ''})

2. דפוסים משמעותיים:
• דפוסים בולטים בין שאלונים שונים${approachNames ? ` (לפי המסגרת התיאורטית של ${approachNames})` : ''}
• קשרים והשלמה בין התוצאות
• תחומים בולטים - דיכאון, חרדה, טראומה, ועוד

3. נקודות חוזק:
• תחומים שבהם המטופל מתפקד טוב
• משאבים פנימיים שניתן לזהות

4. אתגרים מרכזיים:
• תחומים הדורשים התערבות
• סדר עדיפויות

5. המלצות טיפוליות:
• מוקדי טיפול מומלצים${approachNames ? ` בהתאם לגישות ${approachNames}` : ''}
• טכניקות והתערבויות ספציפיות
• סדר עדיפויות לטיפול

כתוב בעברית, בסגנון מקצועי ומעמיק.`;

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
