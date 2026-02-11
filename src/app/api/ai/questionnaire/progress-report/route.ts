import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApproachById, getApproachPrompts, buildIntegrationSection, getScalesPrompt, getUniversalPrompts } from "@/lib/therapeutic-approaches";
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
      select: {
        id: true,
        name: true,
        therapistId: true,
        therapeuticApproaches: true,
        approachNotes: true,
        culturalContext: true,
      },
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
      ? `\nהקשר תרבותי חשוב:\n${client.culturalContext}\nשים לב: אל תפרש התנהגות שהיא נורמטיבית בהקשר התרבותי של המטופל כפתולוגיה. התאם את הניתוח בהתאם.\n`
      : '';

    // בניית ה-prompt
    const prompt = `כללי פורמט (חובה):
- כתוב בעברית בלבד, מימין לשמאל
- מונחים מקצועיים: כתוב קודם בעברית, אנגלית בסוגריים. דוגמה: "קביעות אובייקט (Object Constancy)"
- ללא Markdown: ללא #, ללא **, ללא *, ללא _
- כותרות: בשורה נפרדת עם נקודתיים
- רשימות: סימן • בלבד
- הפרדה: שורה ריקה בין סעיפים

הנחיה: חפש את מה שהשתנה ואת מה שנשאר תקוע. הפרדוקסים מלמדים הכי הרבה.

אתה פסיכולוג קליני ברמה אקדמית גבוהה. בצע ניתוח התקדמות ברמה של פסיכולוג בכיר.
${approachSection}
${culturalSection}
פרטים:
• מטופל: ${client.name}
• תקופה: ${fromDate.toLocaleDateString("he-IL")} - ${toDate.toLocaleDateString("he-IL")}
• מספר פגישות: ${sessions.length}
• מספר שאלונים: ${questionnaires.length}

שאלונים שמולאו:
${questionnairesSummary || "אין שאלונים בתקופה זו"}

סיכומי פגישות:
${sessionsSummary || "אין סיכומי פגישות"}

בצע ניתוח התקדמות מעמיק (500-700 מילים)${approachNames ? ` לפי ${approachNames}` : ''}:

1. סיכום ביצועים ומעורבות:
• כמה פגישות? כמה שאלונים? רמת מעורבות
• מה אומר רצף ההגעה/אי-הגעה על התהליך הטיפולי?

2. מגמות בשאלונים:
• שינויים בציונים לאורך זמן - עלייה, ירידה, תנודות
• תחומים שהשתפרו ותחומים שהחמירו
• פרדוקס: שיפור בתחום אחד עם החמרה באחר - מה המשמעות?

3. תהליך טיפולי מסיכומי פגישות:
• נושאים מרכזיים שעלו${approachNames ? ` (לפי ${approachNames})` : ''}
• דפוסים חוזרים - מה חוזר שוב ושוב?
• שינויים בדינמיקה הטיפולית ובברית הטיפולית (ברית טיפולית - Therapeutic Alliance)

4. אינטגרציה: שאלונים מול פגישות:
• התאמה או פער בין מדדים אובייקטיביים לחוויה הסובייקטיבית
• מטופל שמדווח שיפור בשאלון אבל בפגישות עולה קושי - מה קורה?
• מה הנתונים אומרים *ביחד* שהם לא אומרים *לחוד*?

5. הערכת התקדמות${approachNames ? ` לפי ${approachNames}` : ''}:
• יעדים שהושגו ויעדים שעדיין פתוחים
• באיזה שלב טיפולי המטופל נמצא?
${scalesSection ? `• הערכה כמותית:\n${scalesSection}` : ''}

6. המלצות להמשך:
• המשך באותו כיוון או שינוי?
• מוקדים לתקופה הבאה
• טכניקות ספציפיות${approachNames ? ` מתוך ${approachNames}` : ''}
• מה לשים לב אליו בפגישות הבאות

כל מונח אנגלי חייב להופיע עם תרגום פשוט בעברית.

${getUniversalPrompts()}`;

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

    // עדכון עלות ניסיון
    await updateTrialAiCost(session.user.id, cost);

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
