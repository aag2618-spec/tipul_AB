import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApproachById, getApproachPrompts } from "@/lib/therapeutic-approaches";

// שימוש ב-Gemini 2.0 Flash בלבד
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");
const GEMINI_MODEL = "gemini-2.0-flash";

// עלויות למיליון טוקנים
const COSTS_PER_1M_TOKENS = {
  input: 0.10,
  output: 0.40
};

/**
 * POST /api/ai/questionnaire/progress-report
 * יצירת דוח התקדמות חודשי משולב שאלונים וסיכומי פגישות
 * 
 * תוכניות:
 * - ESSENTIAL: אין גישה
 * - PROFESSIONAL: עד 15 דוחות בחודש
 * - ENTERPRISE: עד 20 דוחות בחודש
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const { clientId, dateFrom, dateTo } = await req.json();

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
      PRO: 15,
      ENTERPRISE: 20,
    };

    const currentCount = monthlyUsage?.progressReportCount || 0;
    const limit = limits[user.aiTier as keyof typeof limits] || 0;

    if (currentCount >= limit) {
      return NextResponse.json(
        {
          error: `הגעת למכסה החודשית (${limit} דוחות). שדרג את התוכנית שלך לעוד דוחות.`,
        },
        { status: 429 }
      );
    }

    // המרת תאריכים
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);

    // קבלת פרטי המטופל
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client || client.therapistId !== user.id) {
      return NextResponse.json({ error: "מטופל לא נמצא" }, { status: 404 });
    }

    // קבלת שאלונים בטווח התאריכים
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

    // קבלת פגישות בטווח התאריכים
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
        { error: "לא נמצאו נתונים בטווח התאריכים שנבחר" },
        { status: 404 }
      );
    }

    // הכנת סיכום שאלונים
    const questionnairesSummary = questionnaires
      .map((r) => {
        return `${r.completedAt?.toLocaleDateString("he-IL")}: ${r.template.name} - ציון: ${r.totalScore || "לא זמין"}`;
      })
      .join("\n");

    // הכנת סיכום פגישות
    const sessionsSummary = sessions
      .map((s) => {
        return `${s.startTime.toLocaleDateString("he-IL")}: ${s.sessionNote?.content?.substring(0, 200) || "אין סיכום"}...`;
      })
      .join("\n\n");

    // קבלת גישות טיפוליות (של המטופל או ברירת מחדל) - דוח התקדמות רק לארגוני
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

    // קבלת ה-prompt המפורט של הגישות
    const approachPrompts = getApproachPrompts(therapeuticApproaches);

    const approachSection = approachNames 
      ? `
=== גישות טיפוליות מוגדרות: ${approachNames} ===

חובה לנתח את ההתקדמות לפי הגישה/ות הבאות. השתמש במושגים הספציפיים של הגישה!

${approachPrompts}

הנחיות חיוניות:
• כל הניתוח חייב להיות דרך העדשה של ${approachNames}
• ציין מושגים ספציפיים מהגישה (עם תרגום עברי אם באנגלית)
• המלצות להמשך טיפול חייבות להתבסס על הטכניקות של הגישה
• עקוב אחר התקדמות לפי הקריטריונים של הגישה

`
      : '';

    // בניית ה-prompt
    const prompt = `חשוב מאוד - כללי פורמט (חובה לציית):
- כתוב טקסט רגיל בלבד, ללא שום עיצוב
- אסור להשתמש ב-Markdown: ללא #, ללא **, ללא *, ללא _
- לכותרות: כתוב את הכותרת בשורה נפרדת עם נקודתיים בסוף
- לרשימות: השתמש בסימן • בלבד
- להפרדה: שורה ריקה בין סעיפים

אתה פסיכולוג מומחה המכין דוח התקדמות מקיף למטופל.
${approachSection}
פרטים:
• מטופל: ${client.name}
• תקופה: ${fromDate.toLocaleDateString("he-IL")} - ${toDate.toLocaleDateString("he-IL")}
• מספר פגישות: ${sessions.length}
• מספר שאלונים: ${questionnaires.length}

שאלונים שמולאו:
${questionnairesSummary || "אין שאלונים בתקופה זו"}

סיכומי פגישות:
${sessionsSummary || "אין סיכומי פגישות"}

הנחיות:
בצע ניתוח מקיף של ההתקדמות (400-600 מילים)${approachNames ? ` לפי גישות: ${approachNames}` : ''}.

מבנה התשובה:

1. סיכום ביצועים:
(2-3 שורות - כמה פגישות? כמה שאלונים? רמת מעורבות והתמדה)

2. התקדמות בשאלונים:
• שינויים בציונים לאורך זמן
• מגמות - שיפור, החמרה, או יציבות
• תחומים שהשתפרו או החמירו

3. תובנות מסיכומי פגישות:
• נושאים מרכזיים שעלו${approachNames ? ` (לפי המסגרת התיאורטית של ${approachNames})` : ''}
• דפוסים חוזרים
• שינויים בדינמיקה הטיפולית

4. ניתוח התקדמות משולב:
• קשרים בין שאלונים לפגישות
• התאמה או אי-התאמה בין מדדים אובייקטיביים לחוויה הסובייקטיבית
• יעדים שהושגו

5. המלצות להמשך טיפול:
• המשך דרך נוכחית או שינוי כיוון?${approachNames ? ` (בהתאם לגישות ${approachNames})` : ''}
• מוקדים לתקופה הבאה
• יעדים להמשך

כתוב בעברית, בסגנון מקצועי ומעמיק. זה דוח חשוב!`;

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
        analysisType: "PROGRESS_REPORT",
        responseIds: questionnaires.map((r) => r.id),
        sessionIds: sessions.map((s) => s.id),
        dateFrom: fromDate,
        dateTo: toDate,
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
        progressReportCount: 1,
        totalCost: cost,
        totalTokens: totalTokens,
      },
      update: {
        progressReportCount: { increment: 1 },
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
    console.error("שגיאה ביצירת דוח התקדמות:", error);
    return NextResponse.json(
      { error: "שגיאה ביצירת דוח ההתקדמות" },
      { status: 500 }
    );
  }
}
