import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApproachPrompts, getApproachById, buildIntegrationSection, getScalesPrompt, getUniversalPrompts } from "@/lib/therapeutic-approaches";
import { checkTrialAiLimit, updateTrialAiCost } from "@/lib/trial-limits";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { getCurrentUsageKey } from "@/lib/date-utils";
import {
  consumeAiAnalysis,
  refundAiAnalysis,
  QuotaExhaustedError,
  type ConsumeResult,
} from "@/lib/credits";

/**
 * Feature flag — Stage 1.17 wire-up.
 *
 * OFF (default): legacy flow — בודק `monthlyUsage.detailedAnalysisCount` ידנית
 *   ואז upsert עם increment.
 * ON: שימוש ב-`consumeAiAnalysis` החדש (atomic check+deduct + bank, FIFO).
 *
 * env var `USE_NEW_CONSUME_AI=true` להפעלה.
 */
function isNewConsumeAiEnabled(): boolean {
  return process.env.USE_NEW_CONSUME_AI === "true";
}

// שימוש ב-Gemini Pro לכל הניתוחים
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");
const DEFAULT_MODEL = "gemini-2.0-flash";

// עלויות למיליון טוקנים
const COSTS_PER_1M_TOKENS = {
  "gemini-2.0-flash": {
    input: 0.10,   // $0.10 per 1M input tokens
    output: 0.40   // $0.40 per 1M output tokens
  }
};

/**
 * POST /api/ai/session/analyze
 * ניתוח פגישה (תמציתי או מפורט)
 * 
 * תוכניות:
 * - ESSENTIAL: אין גישה ל-AI
 * - PROFESSIONAL: ניתוח תמציתי בלבד
 * - ENTERPRISE: ניתוח תמציתי + מפורט לפי גישות
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Stage 1.17.2: declared at function scope so the catch block can refund.
  let aiConsumeReceipt: ConsumeResult | null = null;
  let userIdForRefund: string | null = null;

  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { sessionId, analysisType, force } = await req.json();

    // סוג ניתוח: תמציתי או מפורט
    if (!["CONCISE", "DETAILED"].includes(analysisType)) {
      return NextResponse.json(
        { message: "סוג ניתוח לא תקין" },
        { status: 400 }
      );
    }

    // בדיקת משתמש ותוכנית - כולל גישות טיפוליות
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        aiTier: true,
        therapeuticApproaches: true,
        approachDescription: true,
      }
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    // תוכנית בסיסית - אין גישה ל-AI
    if (user.aiTier === "ESSENTIAL") {
      return NextResponse.json(
        { 
          message: "תכונות AI אינן זמינות בתוכנית הבסיסית",
          errorEn: "AI features not available in Essential plan",
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

    // ניתוח מפורט - רק לתוכנית ארגונית
    if (analysisType === "DETAILED" && user.aiTier !== "ENTERPRISE") {
      return NextResponse.json(
        { 
          message: "ניתוח מפורט זמין רק בתוכנית הארגונית",
          errorEn: "Detailed analysis is only available in Enterprise plan",
          upgradeLink: "/dashboard/settings/billing"
        },
        { status: 403 }
      );
    }

    // 🔴 Cursor BLOCKER (סבב 1.17.2 + סבב 3): כל return point בין consume
    // ל-AI call יוצר double-charge אם לא נקרא refund.
    //
    // ⚠️ FUTURE MAINTAINERS: כל return חדש בין consumeAiAnalysis ל-AI call
    // (model.generateContent) חייב לקרוא `await issueRefund()` לפני ה-return.
    //
    // 4 ה-return points הנוכחיים:
    //   1. !therapySession (404)
    //   2. ownership mismatch (403)
    //   3. !sessionNote (404 — תרחיש יומיומי: מטפל לוחץ ניתוח לפני סיכום)
    //   4. cache hit (200 cached)
    //
    // תיקון נכון לטווח ארוך (אופציה ג' — Stage 1.17.3): להזיז את כל
    // ה-lookups (therapySession + existingAnalysis + ownership) לפני
    // ה-consume, כך שהקרדיט יורד רק כשבאמת רץ AI. אז ה-issueRefund
    // helper הזה יהיה מיותר.
    //
    // הערה: ה-helper גם מאפס `aiConsumeReceipt = null` (side effect מכוון)
    // כדי שה-outer catch לא ינסה refund שני.
    const issueRefund = async () => {
      if (userIdForRefund && aiConsumeReceipt) {
        await refundConsumedAi(userIdForRefund, aiConsumeReceipt);
        aiConsumeReceipt = null;
      }
    };

    // בדיקת מכסה חודשית (רק לניתוח מפורט)
    // Stage 1.17.2: ה-receipt נשמר במשתנה function-scope (declared למעלה)
    // כדי שה-catch יוכל להריץ refund על Gemini/DB failures.
    userIdForRefund = user.id;
    if (analysisType === "DETAILED") {
      if (isNewConsumeAiEnabled()) {
        // Stage 1.17 wire-up — consumeAiAnalysis עושה atomic check+deduct.
        // ה-FOR UPDATE על MonthlyUsage מונע race בין 2 ניתוחים מקבילים.
        //
        // ⚠️ הבדל סמנטי מהזרימה הישנה (Cursor יזהה זאת):
        //   Legacy: limit=20 hardcoded. Wire-up חדש: limit נלקח מ-TierLimits
        //   ולפי `usage-limits.ts` ENTERPRISE=50. **הפעלת flag = העלאת
        //   המכסה האפקטיבית מ-20 ל-50** עבור ENTERPRISE. זה תיקון של
        //   חוסר עקביות ישן, לא רגרסיה.
        try {
          aiConsumeReceipt = await consumeAiAnalysis(user.id, 1);
        } catch (err) {
          if (err instanceof QuotaExhaustedError) {
            return NextResponse.json(
              {
                message: "הגעת למכסה החודשית של ניתוחים מפורטים",
                errorEn: "Monthly limit reached for detailed analyses",
              },
              { status: 429 }
            );
          }
          logger.error("[ai/analyze] consumeAiAnalysis failed", {
            userId: user.id,
            error: err instanceof Error ? err.message : String(err),
          });
          return NextResponse.json(
            { message: "שגיאה בבדיקת מכסת AI" },
            { status: 500 }
          );
        }
      } else {
        // Legacy flow — בדיקה ידנית, deduction ב-upsert בהמשך הראוט.
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

        const currentCount = monthlyUsage?.detailedAnalysisCount || 0;
        const limit = 20; // מכסה חודשית לניתוחים מפורטים

        if (currentCount >= limit) {
          return NextResponse.json(
            {
              message: `הגעת למכסה החודשית (${limit} ניתוחים מפורטים)`,
              errorEn: `Monthly limit reached (${limit} detailed analyses)`
            },
            { status: 429 }
          );
        }
      }
    }

    // קבלת פרטי הפגישה
    const therapySession = await prisma.therapySession.findUnique({
      where: { id: sessionId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            therapeuticApproaches: true,
            approachNotes: true,
            culturalContext: true,
          }
        },
        sessionNote: true,
      },
    });

    if (!therapySession) {
      await issueRefund();
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    // וידוא בעלות
    if (therapySession.therapistId !== user.id) {
      await issueRefund();
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    if (!therapySession.sessionNote) {
      await issueRefund();
      return NextResponse.json(
        { message: "לא נמצא סיכום לפגישה זו" },
        { status: 404 }
      );
    }

    // בדיקה אם כבר קיים ניתוח מאותו סוג (אלא אם ביקשו יצירה מחדש)
    const existingAnalysis = await prisma.sessionAnalysis.findUnique({
      where: { sessionId: sessionId },
    });

    if (!force && existingAnalysis && existingAnalysis.analysisType === analysisType) {
      await issueRefund();
      return NextResponse.json({
        success: true,
        analysis: existingAnalysis,
        cached: true,
      });
    }

    // קבלת גישות טיפוליות (של המטופל או ברירת מחדל של המטפל)
    const approaches =
      (therapySession.client?.therapeuticApproaches?.length ?? 0) > 0
        ? therapySession.client!.therapeuticApproaches
        : user.therapeuticApproaches;

    // קבלת שמות הגישות לתצוגה
    const approachNames = (approaches || [])
      .map(id => {
        const approach = getApproachById(id);
        return approach ? approach.nameHe : null;
      })
      .filter(Boolean)
      .join(", ");

    // בניית ה-prompt לפי סוג הניתוח
    let prompt: string;

    if (analysisType === "CONCISE") {
      // ניתוח תמציתי - גישות רק לארגוני!
      // עבור ארגוני - כולל גם prompt מפורט של הגישות
      const approachPrompts = user.aiTier === 'ENTERPRISE' ? getApproachPrompts(approaches) : '';
      
      prompt = buildConcisePrompt(
        therapySession.client?.name || "לא ידוע",
        therapySession.startTime,
        therapySession.type,
        therapySession.sessionNote.content,
        user.aiTier === 'ENTERPRISE' ? approachNames : undefined,
        user.aiTier === 'ENTERPRISE' ? approachPrompts : undefined,
        user.aiTier === 'ENTERPRISE' ? approaches : undefined,
        therapySession.client?.culturalContext
      );
    } else {
      // ניתוח מפורט - רק לתוכנית ארגונית
      const approachPrompts = getApproachPrompts(approaches);
      
      prompt = buildDetailedPrompt(
        therapySession.client?.name || "לא ידוע",
        therapySession.startTime,
        therapySession.type,
        therapySession.sessionNote.content,
        approachPrompts,
        approaches,
        therapySession.client?.approachNotes,
        therapySession.client?.culturalContext
      );
    }

    // קריאה ל-Gemini 2.0 Flash
    const model = genAI.getGenerativeModel({ model: DEFAULT_MODEL });
    const result = await model.generateContent(prompt);
    const analysis = result.response.text();

    // חישוב עלויות
    const estimatedInputTokens = Math.round(prompt.length / 4);
    const estimatedOutputTokens = Math.round(analysis.length / 4);
    const totalTokens = estimatedInputTokens + estimatedOutputTokens;
    
    const cost = calculateCost(estimatedInputTokens, estimatedOutputTokens);

    // שמירת הניתוח
    const savedAnalysis = await prisma.sessionAnalysis.upsert({
      where: { sessionId: sessionId },
      create: {
        userId: user.id,
        sessionId: sessionId,
        analysisType: analysisType,
        content: analysis,
        aiModel: DEFAULT_MODEL,
        tokensUsed: totalTokens,
        cost: cost,
      },
      update: {
        analysisType: analysisType,
        content: analysis,
        aiModel: DEFAULT_MODEL,
        tokensUsed: totalTokens,
        cost: cost,
      },
    });

    // עדכון סטטיסטיקות שימוש חודשיות — לפי שעון ישראל
    // עדכון MonthlyUsage:
    // - ב-new flow: detailedAnalysisCount כבר עודכן ב-consumeAiAnalysis
    //   (atomic check+deduct לפני ה-AI call). פה רק מוסיפים cost/tokens
    //   ואת conciseAnalysisCount (שלא עובר דרך consumeAiAnalysis).
    // - ב-legacy flow: כל השדות עולים בבת אחת (כולל detailed).
    const isNewFlow = isNewConsumeAiEnabled() && analysisType === "DETAILED";
    const usageKey = getCurrentUsageKey();
    await prisma.monthlyUsage.upsert({
      where: {
        userId_month_year: {
          userId: user.id,
          month: usageKey.month,
          year: usageKey.year,
        },
      },
      create: {
        userId: user.id,
        month: usageKey.month,
        year: usageKey.year,
        conciseAnalysisCount: analysisType === "CONCISE" ? 1 : 0,
        // ב-new flow היצירה כבר נעשתה ב-consumeAiAnalysis עם count=1.
        // אם בפועל הגענו לכאן עם new flow + DETAILED, זה אומר שהיתה race
        // והרשומה נוצרה ב-consumeAiAnalysis. ה-create הזה לא ירוץ.
        detailedAnalysisCount: isNewFlow
          ? 0
          : analysisType === "DETAILED"
            ? 1
            : 0,
        totalCost: cost,
        totalTokens: totalTokens,
      },
      update: {
        conciseAnalysisCount:
          analysisType === "CONCISE" ? { increment: 1 } : undefined,
        // ב-new flow: לא להגדיל שוב — consumeAiAnalysis כבר הגדיל.
        detailedAnalysisCount: isNewFlow
          ? undefined
          : analysisType === "DETAILED"
            ? { increment: 1 }
            : undefined,
        totalCost: { increment: cost },
        totalTokens: { increment: totalTokens },
      },
    });

    // עדכון עלות ניסיון
    await updateTrialAiCost(userId, cost);

    return NextResponse.json({
      success: true,
      analysis: savedAnalysis,
      cached: false,
      model: DEFAULT_MODEL,
      tokens: totalTokens,
      cost: cost,
    });
  } catch (error) {
    logger.error("שגיאה בניתוח פגישה:", { error: error instanceof Error ? error.message : String(error) });

    // Stage 1.17.2: refund אם consumeAiAnalysis הצליח אבל Gemini/DB נכשלו.
    if (userIdForRefund && aiConsumeReceipt) {
      await refundConsumedAi(userIdForRefund, aiConsumeReceipt);
    }

    return NextResponse.json(
      { message: "שגיאה בניתוח הפגישה" },
      { status: 500 }
    );
  }
}

/**
 * Stage 1.17.2: refund helper — מחזיר מכסת AI שהורדה ב-consumeAiAnalysis.
 *
 * Synchronous: ה-caller ממתין ל-refund לפני return של ה-error response.
 * URGENT alert אם גם ה-refund נכשל.
 */
async function refundConsumedAi(
  userId: string,
  receipt: ConsumeResult
): Promise<void> {
  if (receipt.consumed === 0) return;
  try {
    await refundAiAnalysis(userId, receipt);
    logger.info("[ai/analyze] Refunded AI credit after failure", {
      userId,
      consumed: receipt.consumed,
    });
  } catch (refundErr) {
    const errMsg =
      refundErr instanceof Error ? refundErr.message : String(refundErr);
    logger.error("[ai/analyze] Refund FAILED — manual intervention needed", {
      userId,
      receipt,
      error: errMsg,
    });
    void prisma.adminAlert
      .create({
        data: {
          type: "CREDIT_CONSUMPTION_FAILED",
          priority: "URGENT",
          title: "כשל ב-refund של ניתוח AI — איבוד מכסה ידוע",
          message: `consumeAiAnalysis הצליח, generateContent נכשל, refundAiAnalysis נכשל. userId=${userId}`,
          userId,
          metadata: {
            kind: "ai_refund_failed",
            receipt: receipt as unknown as object,
            errorMessage: errMsg,
          },
          actionRequired:
            "תקן ידנית את MonthlyUsage.detailedAnalysisCount ו-creditsUsed לפי ה-receipt.",
        },
      })
      .catch((alertErr) => {
        logger.error("[ai/analyze] Also failed to create refund-failed alert", {
          userId,
          error: alertErr instanceof Error ? alertErr.message : String(alertErr),
        });
      });
  }
}

/**
 * חישוב עלות לפי טוקנים
 */
function calculateCost(inputTokens: number, outputTokens: number): number {
  const costs = COSTS_PER_1M_TOKENS[DEFAULT_MODEL];
  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;
  return inputCost + outputCost;
}

/**
 * בניית prompt לניתוח תמציתי
 * (Professional + Enterprise)
 */
function buildConcisePrompt(
  clientName: string,
  sessionDate: Date,
  sessionType: string,
  noteContent: string,
  approachNames?: string,
  approachPrompts?: string,
  approachIds?: string[],
  culturalContext?: string | null
): string {
  const sessionTypeHe = sessionType === "IN_PERSON" 
    ? "פנים אל פנים" 
    : sessionType === "ONLINE" 
      ? "מקוון" 
      : "טלפוני";

  // בניית section גישות טיפוליות
  let approachSection = '';
  if (approachNames && approachPrompts) {
    approachSection = `
=== גישות טיפוליות: ${approachNames} ===

${approachPrompts}
${approachIds && approachIds.length > 1 ? buildIntegrationSection(approachIds) : ''}
`;
  }

  return `כללי פורמט (חובה):
- כתוב בעברית בלבד, מימין לשמאל
- מונחים מקצועיים: כתוב קודם בעברית, אנגלית בסוגריים. דוגמה: "הזדהות השלכתית (Projective Identification)"
- ללא Markdown: ללא #, ללא **, ללא *, ללא _
- כותרות: בשורה נפרדת עם נקודתיים
- רשימות: סימן • בלבד
- הפרדה: שורה ריקה בין סעיפים

אתה פסיכולוג קליני מומחה המנתח סיכום פגישה טיפולית.

פרטי הפגישה:
מטופל: ${clientName}
תאריך: ${sessionDate.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}
סוג פגישה: ${sessionTypeHe}
${approachSection}
${culturalContext ? `הקשר תרבותי חשוב:\n${culturalContext}\nשים לב: אל תפרש התנהגות שהיא נורמטיבית בהקשר התרבותי של המטופל כפתולוגיה.\n` : ''}
סיכום הפגישה:
${noteContent}

${approachNames ? `חשוב מאוד: כל הניתוח חייב להיות דרך העדשה של ${approachNames}. השתמש במושגים ספציפיים מהגישה!` : ''}

בצע ניתוח תמציתי ומקצועי (250-400 מילים).

מבנה התשובה:

סיכום מרכזי:
(2-3 שורות - מה עלה בפגישה?${approachNames ? ` תאר דרך עדשת ${approachNames}` : ''})

${approachNames ? `ניתוח לפי הגישה (${approachNames}):
• מושג מהגישה שזוהה בפגישה (כתוב בעברית ואנגלית בסוגריים)
• דינמיקה שניתן להבין דרך המסגרת התיאורטית
• תובנה ייחודית שרק הגישה הזו מאפשרת

` : ''}נושאים מרכזיים:
• נושא 1${approachNames ? ` (מנוסח במושגי ${approachNames})` : ''}
• נושא 2
• נושא 3

רגע חשוב בפגישה:
(זהה רגע אחד משמעותי - מעבר נושא, שתיקה, או ביטוי רגשי - ופרש אותו)

רגשות דומיננטיים:
• רגש 1
• רגש 2

המלצות למפגש הבא:
• המלצה 1${approachNames ? ` (מבוססת על ${approachNames})` : ''}
• המלצה 2
• המלצה 3

כתוב בעברית מקצועית ובהירה. כל מונח אנגלי - הוסף לידו תרגום עברי.`;
}

/**
 * בניית prompt לניתוח מפורט
 * (Enterprise בלבד)
 */
function buildDetailedPrompt(
  clientName: string,
  sessionDate: Date,
  sessionType: string,
  noteContent: string,
  approachPrompts: string,
  approachIds: string[],
  clientApproachNotes?: string | null,
  culturalContext?: string | null
): string {
  const sessionTypeHe = sessionType === "IN_PERSON" 
    ? "פנים אל פנים" 
    : sessionType === "ONLINE" 
      ? "מקוון" 
      : "טלפוני";

  const approachNames = approachIds
    .map(id => {
      const approach = getApproachById(id);
      return approach ? approach.nameHe : null;
    })
    .filter(Boolean)
    .join(", ");

  // בניית section אינטגרציה אם נבחרו מספר גישות
  const integrationSection = buildIntegrationSection(approachIds);

  // בניית section סולמות הערכה
  const scalesSection = getScalesPrompt(approachIds);

  // הנחיות קליניות אוניברסליות
  const universalSection = getUniversalPrompts();

  return `כללי פורמט (חובה):
- כתוב בעברית בלבד, מימין לשמאל
- מונחים מקצועיים: כתוב קודם בעברית, אנגלית בסוגריים. דוגמה: "פיצול (Splitting)"
- ללא Markdown: ללא #, ללא **, ללא *, ללא _
- כותרות: בשורה נפרדת עם נקודתיים
- רשימות: סימן • בלבד
- הפרדה: שורה ריקה בין סעיפים

הנחיה חשובה: תתעלם מהתשובה ה"מובנת מאליה" וחפש את הפרדוקס.
בטיפול, הפרדוקסים הם המקום שבו קורה השינוי.

אתה פסיכולוג קליני ברמה אקדמית גבוהה. בצע ניתוח מעמיק ברמה של פסיכולוג בכיר.

פרטי הפגישה:
מטופל: ${clientName}
תאריך: ${sessionDate.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}
סוג פגישה: ${sessionTypeHe}
גישות טיפוליות: ${approachNames || "גישה אקלקטית"}

${clientApproachNotes ? `הערות ספציפיות על הגישה למטופל זה:\n${clientApproachNotes}\n` : ""}
${culturalContext ? `הקשר תרבותי חשוב:\n${culturalContext}\nשים לב: אל תפרש התנהגות שהיא נורמטיבית בהקשר התרבותי של המטופל כפתולוגיה. התאם את הניתוח בהתאם.\n` : ""}
סיכום הפגישה:
${noteContent}

=== מאגר ידע קליני - גישות טיפוליות ===
${approachPrompts || "השתמש בגישה אקלקטית-אינטגרטיבית."}

${integrationSection}

${universalSection}

=== הנחיות לניתוח מעמיק ===

בצע ניתוח מעמיק (600-1000 מילים). חשוב: אל תסתפק בתיאור מה שקרה - חפש את מה שלא נאמר,
את מה שמתחבא מתחת, ואת הפרדוקסים.

מבנה התשובה:

1. סיכום הפגישה:
(4-5 שורות - לא רק העובדות, אלא התהליך הפנימי שקרה. נתח דרך עדשת ${approachNames || "הגישה הטיפולית"})

2. ניתוח תוכן ונושאים:
• נושא מרכזי 1 - מנותח לפי ${approachNames || "הגישה"}
• נושא מרכזי 2 - מנותח לפי ${approachNames || "הגישה"}
• קונפליקטים שעלו (גלויים וסמויים)
• דפוסים חוזרים או חדשים

3. מה שלא נאמר - מעברי נושא ומנגנוני הגנה:
• מעברי נושא חשודים - מה הנושא שממנו ברח ולמה?
• מנגנוני הגנה שזוהו (כתוב בעברית עם אנגלית בסוגריים)
• "הפער" - מה הפער בין מה שנאמר לבין מה שנחווה?

4. ניתוח דינמיקות העברה:
• העברה (Transference) - איך המטופל תופס את המטפל ומה זה אומר?
• העברה נגדית (Countertransference) - מה המטפל עשוי לחוות ומה המשמעות?
• דפוסי יחסים שחוזרים - מה הדפוס ואיפה הוא מתחיל?

5. ניתוח מעמיק לפי ${approachNames || "הגישה הטיפולית"}:
(זהו החלק הכי חשוב! השתמש במושגים הספציפיים של הגישה/ות)
• מושגים מהגישה שזוהו בפגישה (עם הסבר פשוט בעברית)
• תובנות ייחודיות שרק הגישה הזו יכולה לתת
• "סימנים מחשידים" שזוהו לפי כללי הגישה
${approachIds.length > 1 ? `• אינטגרציה: נקודות השקה בין הגישות - איפה הן מאירות את אותו דבר מזוויות שונות?` : ''}

6. ניתוח רגשי:
• רגשות ראשוניים (מה מרגיש באמת) מול משניים (מה מציג)
• ויסות רגשי - איך המטופל מנהל רגשות?
• "רגע מכונן" בפגישה - הרגע הכי חשוב רגשית

7. הערכה כמותית:
${scalesSection || '• דרג את ההתקדמות הכללית בסולם 1-10 עם הסבר'}

8. נקודות עיוורון אפשריות:
• מה המטפל אולי לא שם לב אליו?
• פרשנות חלופית למה שקרה
• תחום שעלה אבל לא נחקר מספיק

9. המלצות והמשך:
• התערבויות ספציפיות מומלצות (לפי ${approachNames || "הגישה"})
• מוקדים למפגשים הבאים
• שאלות ספציפיות לשאול (מנוסחות לפי סגנון הגישה)
• עמדה טיפולית מומלצת

כתוב בעברית מקצועית ובהירה. כל מונח אנגלי חייב להופיע עם תרגום עברי לידו.
חפש את העומק, את מה שבין השורות, ואת הפרדוקסים.`;
}
