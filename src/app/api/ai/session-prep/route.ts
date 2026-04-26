import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { getApproachPrompts, getApproachById, getUniversalPromptsLight } from "@/lib/therapeutic-approaches";
import { checkTrialAiLimit, updateTrialAiCost } from "@/lib/trial-limits";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { getTierLimits, isStaff } from "@/lib/usage-limits";
import { getCurrentUsageKey } from "@/lib/date-utils";

// שימוש ב-Gemini 2.0 Flash בלבד
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");
const GEMINI_MODEL = "gemini-2.0-flash";

// עלויות למיליון טוקנים
const COSTS_PER_1M_TOKENS = {
  input: 0.10,
  output: 0.40
};

/**
 * GET /api/ai/session-prep
 * קבלת הכנה קיימת לפגישה
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const sessionDate = searchParams.get('sessionDate');

    if (!clientId) {
      return NextResponse.json(
        { message: "נדרש מזהה מטופל" },
        { status: 400 }
      );
    }

    // חיפוש הכנה קיימת למטופל ולתאריך הספציפי
    // מחפשים הכנה לפי sessionDate (תאריך הפגישה)
    const targetDate = sessionDate ? new Date(sessionDate) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingPrep = await prisma.sessionPrep.findFirst({
      where: {
        clientId,
        userId: userId,
        sessionDate: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!existingPrep) {
      return NextResponse.json({ content: null }, { status: 200 });
    }

    return NextResponse.json({
      id: existingPrep.id,
      content: existingPrep.content,
      tokensUsed: existingPrep.tokensUsed,
      cost: existingPrep.cost,
      createdAt: existingPrep.createdAt
    });
  } catch (error: unknown) {
    logger.error("שגיאה בקבלת הכנה לפגישה:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בקבלת הכנה לפגישה" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai/session-prep
 * הכנה לפגישה באמצעות AI
 * 
 * תוכניות:
 * - ESSENTIAL: אין גישה
 * - PROFESSIONAL: הכנה תמציתית
 * - ENTERPRISE: הכנה מפורטת עם גישות
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const body = await request.json();
    const { clientId, sessionDate } = body;

    if (!clientId) {
      return NextResponse.json(
        { message: "נדרש מזהה מטופל" },
        { status: 400 }
      );
    }

    // קבלת פרטי המשתמש
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { aiUsageStats: true }
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    // Stage 1.17.4 (סבב 3): ADMIN/MANAGER עוברים את כל ה-gates ללא הגבלה.
    // counters עדיין מתעדכנים בהמשך הראוט (tracking ולא enforcement).
    const staffBypass = isStaff(user.role);

    // משתנים שצריך גם ב-staff path להגדיר כדי שה-upsert בסוף הראוט יעבוד.
    const { month: usageMonth, year: usageYear } = getCurrentUsageKey();

    if (!staffBypass) {
      // תוכנית בסיסית - אין גישה ל-AI
      if (user.aiTier === 'ESSENTIAL') {
        return NextResponse.json(
          {
            message: "תכונות AI אינן זמינות בתוכנית הבסיסית. שדרג לתוכנית מקצועית או ארגונית.",
            upgradeLink: "/dashboard/settings/billing"
          },
          { status: 403 }
        );
      }

      // בדיקת מגבלות ניסיון (₪5 cap)
      const trialCheck = await checkTrialAiLimit(userId);
      if (!trialCheck.allowed) {
        return NextResponse.json(
          {
            message: trialCheck.message || "הגעת למגבלת השימוש בתקופת הניסיון.",
            upgradeLink: "/dashboard/settings/billing",
            trialLimitReached: true,
          },
          { status: 429 }
        );
      }

      // Stage 1.17.4: בדיקת מכסה ספציפית של הכנות לפגישה לפי
      // `/admin/tier-settings` (TierLimits.sessionPrepLimit) על MonthlyUsage.
      // -1 = חסום (פיצ'ר לא זמין), 0 = ללא הגבלה, N>0 = מכסה חודשית.
      //
      // שינוי התנהגות מ-pre-1.17.4: עד עכשיו `MonthlyUsage.sessionPrepCount`
      // לא עודכן בראוט הזה (כל המגבלות באו מ-`aIUsageStats` הכללי). מההפעלה
      // המונה יתחיל מ-0 לכל המשתמשים → משתמש PRO/ENTERPRISE שכבר ניצל הרבה
      // הכנות החודש לא ייחסם רטרואקטיבית, אך המכסה החדשה (default 200/400)
      // תיכנס לתוקף מההפעלה.
      const tierLimitsSP = await getTierLimits(user.aiTier);
      const sessionPrepLimit = tierLimitsSP.sessionPrepLimit;
      const monthlyUsageSP = await prisma.monthlyUsage.findUnique({
        where: {
          userId_month_year: { userId: userId, month: usageMonth, year: usageYear },
        },
        select: { sessionPrepCount: true },
      });
      const currentSpCount = monthlyUsageSP?.sessionPrepCount || 0;

      if (sessionPrepLimit === -1) {
        return NextResponse.json(
          {
            message: "הכנה לפגישה אינה זמינה בתוכנית הנוכחית. שדרג את התוכנית שלך.",
            upgradeLink: "/dashboard/settings/billing",
          },
          { status: 403 }
        );
      }

      if (sessionPrepLimit > 0 && currentSpCount >= sessionPrepLimit) {
        return NextResponse.json(
          {
            message: `הגעת למכסה החודשית (${sessionPrepLimit} הכנות לפגישה). שדרג את התוכנית שלך לקבלת מכסה נוספת.`,
            upgradeLink: "/dashboard/settings/billing",
          },
          { status: 429 }
        );
      }

      // בדיקת מגבלות rate-limit כלליות (אופציונלי, מנוהל מ-GlobalAISettings).
      // משלים את TierLimits — נותן לאדמין שליטה גלובלית ביומיים/חודשי על כלל הקריאות.
      const globalSettings = await prisma.globalAISettings.findFirst();

      if (globalSettings) {
        const dailyLimit = user.aiTier === 'PRO'
          ? globalSettings.dailyLimitPro
          : globalSettings.dailyLimitEnterprise;

        const monthlyLimit = user.aiTier === 'PRO'
          ? globalSettings.monthlyLimitPro
          : globalSettings.monthlyLimitEnterprise;

        // בדיקת מגבלה יומית
        if (user.aiUsageStats && user.aiUsageStats.dailyCalls >= dailyLimit) {
          if (globalSettings.blockOnExceed) {
            return NextResponse.json(
              { message: `הגעת למכסה היומית (${dailyLimit} קריאות). נסה שוב מחר.` },
              { status: 429 }
            );
          }
        }

        // בדיקת מגבלה חודשית
        if (user.aiUsageStats && user.aiUsageStats.currentMonthCalls >= monthlyLimit) {
          if (globalSettings.blockOnExceed) {
            return NextResponse.json(
              { message: `הגעת למכסה החודשית (${monthlyLimit} קריאות).` },
              { status: 429 }
            );
          }
        }
      }
    }

    // קבלת פרטי המטופל
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client || client.therapistId !== userId) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // קבלת 5 הפגישות האחרונות עם סיכומים
    const recentSessions = await prisma.therapySession.findMany({
      where: {
        clientId,
        status: 'COMPLETED',
        sessionNote: {
          isNot: null
        }
      },
      include: {
        sessionNote: true
      },
      orderBy: { startTime: 'desc' },
      take: 5
    });

    if (recentSessions.length === 0) {
      return NextResponse.json(
        { 
          message: "אין סיכומי פגישות קודמות. כתוב לפחות סיכום אחד כדי להשתמש בהכנה ל-AI.",
          content: null
        },
        { status: 200 }
      );
    }

    // הכנת הנתונים
    const recentNotes = recentSessions
      .filter(s => s.sessionNote?.content)
      .map(s => ({
        date: format(new Date(s.startTime), 'dd/MM/yyyy', { locale: he }),
        content: s.sessionNote!.content
      }));

    // קבלת שאלונים אחרונים - רק מ-30 הימים האחרונים (כדי לא להטריד)
    let recentQuestionnaires: string = '';
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const questionnaires = await prisma.questionnaireResponse.findMany({
        where: {
          clientId,
          therapistId: userId,
          status: 'COMPLETED',
          completedAt: { gte: thirtyDaysAgo },
        },
        include: { template: true },
        orderBy: { completedAt: 'desc' },
        take: 3,
      });
      if (questionnaires.length > 0) {
        recentQuestionnaires = questionnaires.map(q => 
          `• ${q.template.name}: ציון ${q.totalScore || 'לא זמין'} (${q.completedAt ? format(new Date(q.completedAt), 'dd/MM/yyyy', { locale: he }) : 'לא ידוע'})`
        ).join('\n');
      }
    } catch {
      // שאלונים אופציונליים - אם יש שגיאה ממשיכים בלעדיהם
    }

    // קבלת גישות טיפוליות (של המטופל או ברירת מחדל)
    const therapeuticApproaches = (client.therapeuticApproaches && client.therapeuticApproaches.length > 0)
      ? client.therapeuticApproaches
      : (user.therapeuticApproaches || []);

    logger.info("[ai/session-prep] Approaches selected", {
      userTier: user.aiTier,
      userApproachCount: user.therapeuticApproaches?.length ?? 0,
      clientApproachCount: client.therapeuticApproaches?.length ?? 0,
      selectedApproachCount: therapeuticApproaches.length,
    });

    // בניית שמות הגישות (לשימוש בכל התוכניות)
    const approachNames = therapeuticApproaches
      .map(id => {
        const approach = getApproachById(id);
        return approach ? approach.nameHe : null;
      })
      .filter(Boolean)
      .join(", ");

    // בניית ה-prompt לפי התוכנית
    let prompt: string;

    if (user.aiTier === 'ENTERPRISE') {
      // תוכנית ארגונית - הכנה מפורטת עם גישות
      const approachPrompts = getApproachPrompts(therapeuticApproaches);

      logger.info("[ai/session-prep] Enterprise prompt built", {
        approachCount: therapeuticApproaches.length,
        approachPromptsLength: approachPrompts.length,
      });
      
      prompt = buildEnterprisePrompt(
        client.name,
        sessionDate || format(new Date(), 'dd/MM/yyyy', { locale: he }),
        recentNotes,
        approachNames,
        approachPrompts,
        client.approachNotes,
        client.culturalContext,
        recentQuestionnaires
      );
    } else {
      // תוכנית מקצועית - הכנה תמציתית (בלי גישות!)
      prompt = buildProfessionalPrompt(
        client.name,
        sessionDate || format(new Date(), 'dd/MM/yyyy', { locale: he }),
        recentNotes
      );
    }

    // קריאה ל-Gemini 2.0 Flash
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const content = result.response.text();

    // חישוב עלויות
    const estimatedInputTokens = Math.round(prompt.length / 4);
    const estimatedOutputTokens = Math.round(content.length / 4);
    const totalTokens = estimatedInputTokens + estimatedOutputTokens;
    
    const inputCost = (estimatedInputTokens / 1_000_000) * COSTS_PER_1M_TOKENS.input;
    const outputCost = (estimatedOutputTokens / 1_000_000) * COSTS_PER_1M_TOKENS.output;
    const cost = inputCost + outputCost;

    // חילוץ תובנות והמלצות מהתוכן
    const insights = extractSection(content, "תובנות") || extractSection(content, "נקודות מפתח");
    const recommendations = extractSection(content, "המלצות") || extractSection(content, "שאלות מוצעות");

    // שמירת ההכנה
    const sessionPrep = await prisma.sessionPrep.create({
      data: {
        userId: userId,
        clientId,
        sessionDate: sessionDate ? new Date(sessionDate) : new Date(),
        content: content,
        insights: insights || undefined,
        recommendations: recommendations || undefined,
        aiModel: GEMINI_MODEL,
        tokensUsed: totalTokens,
        cost: cost,
      }
    });

    // עדכון סטטיסטיקות שימוש
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Stage 1.17.4: שני ה-upserts אטומיים יחד — `aIUsageStats` (rate-limit
    // גלובלי) ו-`MonthlyUsage.sessionPrepCount` (אכיפת tierLimits) חייבים
    // להיות קונסיסטנטיים. ללא transaction, כשל בשני יוצר drift בין שני
    // המקורות (rate-limit מתעדכן אבל המכסה לא, או להפך).
    await prisma.$transaction([
      prisma.aIUsageStats.upsert({
        where: { userId: userId },
        create: {
          userId: userId,
          dailyCalls: 1,
          currentMonthCalls: 1,
          currentMonthTokens: totalTokens,
          currentMonthCost: cost,
          totalCalls: 1,
          totalCost: cost,
          lastResetDate: today,
        },
        update: {
          dailyCalls: { increment: 1 },
          currentMonthCalls: { increment: 1 },
          currentMonthTokens: { increment: totalTokens },
          currentMonthCost: { increment: cost },
          totalCalls: { increment: 1 },
          totalCost: { increment: cost },
        },
      }),
      prisma.monthlyUsage.upsert({
        where: {
          userId_month_year: { userId: userId, month: usageMonth, year: usageYear },
        },
        create: {
          userId: userId,
          month: usageMonth,
          year: usageYear,
          sessionPrepCount: 1,
          totalCost: cost,
          totalTokens: totalTokens,
        },
        update: {
          sessionPrepCount: { increment: 1 },
          totalCost: { increment: cost },
          totalTokens: { increment: totalTokens },
        },
      }),
    ]);

    // עדכון עלות ניסיון
    await updateTrialAiCost(userId, cost);

    return NextResponse.json({
      success: true,
      id: sessionPrep.id,
      content: content,
      insights: insights,
      recommendations: recommendations,
      tokensUsed: totalTokens,
      cost: cost,
      model: GEMINI_MODEL,
      tier: user.aiTier
    });

  } catch (error: unknown) {
    logger.error('שגיאה בהכנה לפגישה:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "שגיאה פנימית בשרת" },
      { status: 500 }
    );
  }
}

/**
 * בניית prompt לתוכנית מקצועית (תמציתי - בלי גישות)
 */
function buildProfessionalPrompt(
  clientName: string,
  sessionDate: string,
  recentNotes: Array<{date: string, content: string}>
): string {
  const notesText = recentNotes
    .map((note, i) => `פגישה ${i + 1} (${note.date}):\n${note.content}`)
    .join('\n\n---\n\n');

  return `חשוב מאוד - כללי פורמט (חובה לציית):
- כתוב טקסט רגיל בלבד, ללא שום עיצוב
- אסור להשתמש ב-Markdown: ללא #, ללא **, ללא *, ללא _
- לכותרות: כתוב את הכותרת בשורה נפרדת עם נקודתיים בסוף
- לרשימות: השתמש בסימן • בלבד
- להפרדה: שורה ריקה בין סעיפים

אתה פסיכולוג מומחה המכין מטפל לפגישה הקרובה.

פרטים:
מטופל: ${clientName}
תאריך הפגישה הקרובה: ${sessionDate}

סיכומי הפגישות האחרונות:
${notesText}

הנחיות:
הכן סיכום תמציתי להכנה לפגישה (200-300 מילים).

מבנה התשובה:

סיכום המצב:
(3-4 שורות - מה הנושאים המרכזיים שעולים?)

נקודות מפתח להמשך:
• נקודה 1
• נקודה 2
• נקודה 3

המלצות לפגישה:
• המלצה 1
• המלצה 2

שאלות מוצעות:
• שאלה 1
• שאלה 2

כתוב בעברית, בסגנון מקצועי ותמציתי.`;
}

/**
 * בניית prompt לתוכנית ארגונית (מפורט עם גישות)
 */
function buildEnterprisePrompt(
  clientName: string,
  sessionDate: string,
  recentNotes: Array<{date: string, content: string}>,
  approachNames: string,
  approachPrompts: string,
  clientApproachNotes?: string | null,
  culturalContext?: string | null,
  recentQuestionnaires?: string
): string {
  const notesText = recentNotes
    .map((note, i) => `פגישה ${i + 1} (${note.date}):\n${note.content}`)
    .join('\n\n---\n\n');

  return `חשוב מאוד - כללי פורמט (חובה לציית):
- כתוב טקסט רגיל בלבד, ללא שום עיצוב
- אסור להשתמש ב-Markdown: ללא #, ללא **, ללא *, ללא _
- לכותרות: כתוב את הכותרת בשורה נפרדת עם נקודתיים בסוף
- לרשימות: השתמש בסימן • בלבד
- להפרדה: שורה ריקה בין סעיפים
- מונחים באנגלית: הוסף תרגום עברי בסוגריים

אתה פסיכולוג מומחה ברמה אקדמית גבוהה המכין מטפל לפגישה הקרובה.

פרטים:
מטופל: ${clientName}
תאריך הפגישה הקרובה: ${sessionDate}
גישות טיפוליות: ${approachNames || "גישה אקלקטית"}

${clientApproachNotes ? `הערות על הגישה למטופל זה:\n${clientApproachNotes}\n` : ""}
${culturalContext ? `הקשר תרבותי חשוב:\n${culturalContext}\nשים לב: התאם את ההכנה וההמלצות להקשר התרבותי של המטופל.\n` : ""}
${recentQuestionnaires ? `שאלונים אחרונים שמולאו:\n${recentQuestionnaires}\nשים לב: אם יש ציון גבוה או שינוי מציונים קודמים - ציין בהכנה.\n` : ""}
סיכומי הפגישות האחרונות:
${notesText}

הנחיות מפורטות לפי הגישות הטיפוליות:
${approachPrompts || "השתמש בגישה אקלקטית-אינטגרטיבית."}

הנחיות:
הכן הכנה מפורטת לפגישה. קצר וממוקד - רק מה שהמטפל צריך לדעת לפני שנכנס לחדר.

מבנה התשובה:

השורה התחתונה:
(2-3 משפטים - מה הכי חשוב שהמטפל ידע לפני הפגישה?)

מה נשאר פתוח:
• נושאים שעלו בפגישות קודמות ולא נסגרו - חייבים להמשיך
• נושאים שנעלמו פתאום - ייתכן שהודחקו, שווה לבדוק בעדינות
• "חוטים פתוחים" - דברים שהמטופל אמר בחצי פה

ניתוח לפי ${approachNames || "הגישה הטיפולית"}:
• איפה המטופל נמצא לפי הגישה? (שלב, דפוס, דינמיקה)
• מה צפוי שיעלה לפי הגישה?
• מושגים רלוונטיים מהגישה (בעברית + אנגלית בסוגריים)

המלצות לפגישה:
• מה לעשות - טכניקות ספציפיות
• מה לא לעשות - "זהירות מ..." (למשל: "אל תלחץ על נושא X - המטופל עדיין לא מוכן")
• מה לחפש - סימנים חיוביים או מדאיגים

שאלות מוצעות:
• 3 שאלות ספציפיות שמתאימות לגישה ולמה שעולה מהפגישות האחרונות
• לפחות שאלה אחת על מה שנשאר פתוח

כתוב בעברית, בסגנון מקצועי וחם. כל מונח אנגלי עם תרגום עברי פשוט.

${getUniversalPromptsLight()}`;
}

/**
 * חילוץ סעיף מהתוכן
 */
function extractSection(content: string, sectionName: string): string | null {
  const regex = new RegExp(`\\*\\*[^*]*${sectionName}[^*]*\\*\\*[:\\s]*([\\s\\S]*?)(?=\\*\\*|$)`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}
