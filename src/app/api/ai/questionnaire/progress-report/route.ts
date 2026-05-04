import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApproachById, getApproachPrompts, buildIntegrationSection, getScalesPrompt, getUniversalPrompts } from "@/lib/therapeutic-approaches";
import { checkTrialAiLimit, updateTrialAiCost } from "@/lib/trial-limits";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { getCurrentUsageKey } from "@/lib/date-utils";
import { getTierLimits, isStaff } from "@/lib/usage-limits";
import {
  loadScopeUser,
  buildClientWhere,
  buildSessionWhere,
  canSecretaryAccessModel,
} from "@/lib/scope";

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
 * תוכניות (ברירות מחדל — ניתנות לעריכה ב-`/admin/tier-settings`):
 * - ESSENTIAL: אין גישה
 * - PRO: עד 15 דוחות בחודש
 * - ENTERPRISE: עד 20 דוחות בחודש
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    // דוח התקדמות מייצר ניתוח קליני — חסום למזכירה
    if (!canSecretaryAccessModel(scopeUser, "QuestionnaireAnalysis")) {
      return NextResponse.json(
        { message: "אין הרשאה לתוכן קליני" },
        { status: 403 }
      );
    }

    const { clientId, dateFrom, dateTo } = await req.json();

    // קבלת פרטי המשתמש
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    // Stage 1.17.4 (סבב 3): ADMIN/MANAGER עוברים את כל ה-gates ללא הגבלה.
    // counters עדיין מתעדכנים (tracking ולא enforcement).
    const staffBypass = isStaff(user.role);

    const { month, year } = getCurrentUsageKey();
    const monthlyUsage = await prisma.monthlyUsage.findUnique({
      where: {
        userId_month_year: {
          userId: user.id,
          month,
          year,
        },
      },
    });
    const currentCount = monthlyUsage?.progressReportCount || 0;
    // limit=0 ל-staff → response יציג remaining: null ("ללא הגבלה").
    let limit = 0;

    if (!staffBypass) {
      // תוכנית בסיסית - אין גישה
      if (user.aiTier === "ESSENTIAL") {
        return NextResponse.json(
          {
            message: "תכונות AI אינן זמינות בתוכנית הבסיסית",
            upgradeLink: "/dashboard/settings/billing"
          },
          { status: 403 }
        );
      }

      // בדיקת מגבלות ניסיון
      const trialCheck = await checkTrialAiLimit(userId);
      if (!trialCheck.allowed) {
        return NextResponse.json(
          { message: trialCheck.message, upgradeLink: "/dashboard/settings/billing", trialLimitReached: true },
          { status: 429 }
        );
      }

      // Stage 1.17.4: מגבלות נטענות מ-`/admin/tier-settings` דרך `getTierLimits`.
      // fallback ל-DEFAULT_LIMITS אם הרשומה חסרה. סמנטיקה: -1 חסום, 0 ללא הגבלה.
      const tierLimits = await getTierLimits(user.aiTier);
      limit = tierLimits.progressReportLimit;

      if (limit === -1) {
        return NextResponse.json(
          {
            message: "דוח התקדמות אינו זמין בתוכנית הנוכחית. שדרג את התוכנית שלך.",
            upgradeLink: "/dashboard/settings/billing",
          },
          { status: 403 }
        );
      }

      if (limit > 0 && currentCount >= limit) {
        return NextResponse.json(
          {
            message: `הגעת למכסה החודשית (${limit} דוחות). שדרג את התוכנית שלך לקבלת מכסה נוספת.`,
            upgradeLink: "/dashboard/settings/billing",
          },
          { status: 429 }
        );
      }
    }

    // המרת תאריכים
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);

    // קבלת פרטי המטופל — בהתאמה ל-scope (מטפל עצמאי / קליניקה)
    const clientWhere = buildClientWhere(scopeUser);
    const client = await prisma.client.findFirst({
      where: { AND: [{ id: clientId }, clientWhere] },
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
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // קבלת שאלונים בטווח התאריכים — דרך scope של client
    const questionnaires = await prisma.questionnaireResponse.findMany({
      where: {
        AND: [
          { client: clientWhere },
          {
            clientId: clientId,
            status: "COMPLETED",
            completedAt: {
              gte: fromDate,
              lte: toDate,
            },
          },
        ],
      },
      include: {
        template: true,
      },
      orderBy: {
        completedAt: "asc",
      },
    });

    // קבלת פגישות בטווח התאריכים — דרך scope של sessions
    const sessionWhere = buildSessionWhere(scopeUser);
    const sessions = await prisma.therapySession.findMany({
      where: {
        AND: [
          sessionWhere,
          {
            clientId: clientId,
            status: "COMPLETED",
            startTime: {
              gte: fromDate,
              lte: toDate,
            },
          },
        ],
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
        { message: "לא נמצאו נתונים בטווח התאריכים שנבחר" },
        { status: 404 }
      );
    }

    // הכנת סיכום שאלונים
    const questionnairesSummary = questionnaires
      .map((r) => {
        return `${r.completedAt?.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}: ${r.template.name} - ציון: ${r.totalScore || "לא זמין"}`;
      })
      .join("\n");

    // הכנת סיכום פגישות
    const sessionsSummary = sessions
      .map((s) => {
        return `${s.startTime.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}: ${s.sessionNote?.content?.substring(0, 200) || "אין סיכום"}...`;
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
• תקופה: ${fromDate.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })} - ${toDate.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}
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
        organizationId: scopeUser.organizationId,
      },
    });

    // עדכון סטטיסטיקות שימוש חודשיות — לפי שעון ישראל
    await prisma.monthlyUsage.upsert({
      where: {
        userId_month_year: {
          userId: user.id,
          month,
          year,
        },
      },
      create: {
        userId: user.id,
        month,
        year,
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
    await updateTrialAiCost(userId, cost);

    return NextResponse.json({
      success: true,
      analysis: savedAnalysis,
      model: GEMINI_MODEL,
      usage: {
        current: currentCount + 1,
        limit: limit,
        // null = ללא הגבלה (limit===0). frontend מציג "ללא הגבלה" כש-null.
        remaining: limit === 0 ? null : Math.max(0, limit - currentCount - 1),
      },
    });
  } catch (error) {
    logger.error("שגיאה ביצירת דוח התקדמות:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת דוח ההתקדמות" },
      { status: 500 }
    );
  }
}
