import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApproachPrompts, getApproachById } from "@/lib/therapeutic-approaches";

// שימוש ב-Gemini 2.0 Flash לכל הניתוחים (זול ומהיר!)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");
const DEFAULT_MODEL = "gemini-2.0-flash-exp";

// עלויות למיליון טוקנים
const COSTS_PER_1M_TOKENS = {
  "gemini-2.0-flash-exp": {
    input: 0.10,  // $0.10 per 1M input tokens
    output: 0.40  // $0.40 per 1M output tokens
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
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const { sessionId, analysisType } = await req.json();

    // סוג ניתוח: תמציתי או מפורט
    if (!["CONCISE", "DETAILED"].includes(analysisType)) {
      return NextResponse.json(
        { error: "סוג ניתוח לא תקין" },
        { status: 400 }
      );
    }

    // בדיקת משתמש ותוכנית
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });
    }

    // תוכנית בסיסית - אין גישה ל-AI
    if (user.aiTier === "ESSENTIAL") {
      return NextResponse.json(
        { 
          error: "תכונות AI אינן זמינות בתוכנית הבסיסית",
          errorEn: "AI features not available in Essential plan",
          upgradeLink: "/dashboard/settings/billing"
        },
        { status: 403 }
      );
    }

    // ניתוח מפורט - רק לתוכנית ארגונית
    if (analysisType === "DETAILED" && user.aiTier !== "ENTERPRISE") {
      return NextResponse.json(
        { 
          error: "ניתוח מפורט זמין רק בתוכנית הארגונית",
          errorEn: "Detailed analysis is only available in Enterprise plan",
          upgradeLink: "/dashboard/settings/billing"
        },
        { status: 403 }
      );
    }

    // בדיקת מכסה חודשית (רק לניתוח מפורט)
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
      const limit = 20; // מכסה חודשית לניתוחים מפורטים

      if (currentCount >= limit) {
        return NextResponse.json(
          { 
            error: `הגעת למכסה החודשית (${limit} ניתוחים מפורטים)`,
            errorEn: `Monthly limit reached (${limit} detailed analyses)`
          },
          { status: 429 }
        );
      }
    }

    // קבלת פרטי הפגישה
    const therapySession = await prisma.therapySession.findUnique({
      where: { id: sessionId },
      include: {
        client: true,
        sessionNote: true,
      },
    });

    if (!therapySession) {
      return NextResponse.json({ error: "פגישה לא נמצאה" }, { status: 404 });
    }

    // וידוא בעלות
    if (therapySession.therapistId !== user.id) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    if (!therapySession.sessionNote) {
      return NextResponse.json(
        { error: "לא נמצא סיכום לפגישה זו" },
        { status: 404 }
      );
    }

    // בדיקה אם כבר קיים ניתוח מאותו סוג
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

    // קבלת גישות טיפוליות (של המטופל או ברירת מחדל של המטפל)
    const approaches =
      (therapySession.client?.therapeuticApproaches?.length ?? 0) > 0
        ? therapySession.client!.therapeuticApproaches
        : user.therapeuticApproaches;

    // בניית ה-prompt לפי סוג הניתוח
    let prompt: string;

    if (analysisType === "CONCISE") {
      // ניתוח תמציתי - לתוכנית מקצועית וארגונית
      prompt = buildConcisePrompt(
        therapySession.client?.name || "לא ידוע",
        therapySession.startTime,
        therapySession.type,
        therapySession.sessionNote.content
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
        therapySession.client?.approachNotes
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

    // עדכון סטטיסטיקות שימוש חודשיות
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
        conciseAnalysisCount: analysisType === "CONCISE" ? 1 : 0,
        detailedAnalysisCount: analysisType === "DETAILED" ? 1 : 0,
        totalCost: cost,
        totalTokens: totalTokens,
      },
      update: {
        conciseAnalysisCount: analysisType === "CONCISE" ? { increment: 1 } : undefined,
        detailedAnalysisCount: analysisType === "DETAILED" ? { increment: 1 } : undefined,
        totalCost: { increment: cost },
        totalTokens: { increment: totalTokens },
      },
    });

    return NextResponse.json({
      success: true,
      analysis: savedAnalysis,
      cached: false,
      model: DEFAULT_MODEL,
      tokens: totalTokens,
      cost: cost,
    });
  } catch (error) {
    console.error("שגיאה בניתוח פגישה:", error);
    return NextResponse.json(
      { error: "שגיאה בניתוח הפגישה" },
      { status: 500 }
    );
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
  noteContent: string
): string {
  const sessionTypeHe = sessionType === "IN_PERSON" 
    ? "פנים אל פנים" 
    : sessionType === "ONLINE" 
      ? "מקוון" 
      : "טלפוני";

  return `אתה פסיכולוג מומחה המנתח סיכום פגישה טיפולית.

## פרטי הפגישה:
- מטופל: ${clientName}
- תאריך: ${sessionDate.toLocaleDateString("he-IL")}
- סוג פגישה: ${sessionTypeHe}

## סיכום הפגישה:
${noteContent}

---

## הנחיות לניתוח:
בצע ניתוח תמציתי ומקצועי (200-300 מילים).

### מבנה התשובה:

**סיכום מרכזי:**
(2-3 שורות - מה עלה בפגישה?)

**נושאים מרכזיים:**
• נושא 1
• נושא 2
• נושא 3

**רגשות דומיננטיים:**
• רגש 1
• רגש 2

**המלצות למפגש הבא:**
• המלצה 1
• המלצה 2
• המלצה 3

---

כתוב בעברית, בסגנון מקצועי ותמציתי.
אל תכתוב באנגלית אלא אם מדובר במונח מקצועי ספציפי.`;
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
  clientApproachNotes?: string | null
): string {
  const sessionTypeHe = sessionType === "IN_PERSON" 
    ? "פנים אל פנים" 
    : sessionType === "ONLINE" 
      ? "מקוון" 
      : "טלפוני";

  // קבלת שמות הגישות בעברית
  const approachNames = approachIds
    .map(id => {
      const approach = getApproachById(id);
      return approach ? approach.nameHe : null;
    })
    .filter(Boolean)
    .join(", ");

  return `אתה פסיכולוג מומחה ברמה אקדמית גבוהה המנתח לעומק סיכום פגישה טיפולית.

## פרטי הפגישה:
- מטופל: ${clientName}
- תאריך: ${sessionDate.toLocaleDateString("he-IL")}
- סוג פגישה: ${sessionTypeHe}
- גישות טיפוליות: ${approachNames || "גישה אקלקטית"}

${clientApproachNotes ? `## הערות על הגישה למטופל זה:\n${clientApproachNotes}\n` : ""}

## סיכום הפגישה:
${noteContent}

---

## הנחיות מפורטות לפי הגישות הטיפוליות:

${approachPrompts || "השתמש בגישה אקלקטית-אינטגרטיבית."}

---

## הנחיות לניתוח מעמיק:
בצע ניתוח מעמיק ברמה אקדמית גבוהה (600-900 מילים).

### מבנה התשובה:

**1. סיכום הפגישה:**
(4-5 שורות - סקירה מקיפה של מה שקרה)

**2. ניתוח תוכן:**
• נושא מרכזי 1 - פירוט
• נושא מרכזי 2 - פירוט
• קונפליקטים שעלו
• דפוסים חוזרים או חדשים

**3. ניתוח דינמיקות:**
• העברה (טרנספרנס) - כיצד המטופל רואה אותך?
• ניגוד-העברה (קאונטר-טרנספרנס) - מה עלול להתעורר אצלך?
• דפוסי יחסים שחוזרים
• מנגנוני הגנה בולטים

**4. ניתוח רגשי:**
• רגשות ראשוניים ומשניים
• רגולציה רגשית
• מעברים רגשיים בפגישה

**5. ניתוח לפי הגישה הטיפולית (${approachNames || "אקלקטית"}):**
(בחלק זה, יש להשתמש במושגים ובמסגרת הניתוח של הגישה הספציפית!)
• מושגים מרכזיים מהגישה שרלוונטיים
• תובנות ייחודיות לפי הגישה
• המלצות לפי מסגרת הגישה

**6. התקדמות טיפולית:**
• מה השתנה?
• התקדמות לעבר יעדים
• אתגרים והזדמנויות

**7. המלצות והמשך טיפול:**
• התערבויות מומלצות ספציפיות
• מוקדים למפגשים הבאים
• שאלות או טכניקות לשימוש

---

## כללים חשובים:
✅ כתוב בעברית בלבד (למעט מונחים מקצועיים)
✅ מונחים באנגלית - הוסף תרגום עברי בסוגריים בשורה נפרדת
✅ היה ספציפי ומעמיק - זה ניתוח ברמה גבוהה!
✅ השתמש במושגים מהגישה הטיפולית שהוגדרה
✅ תן המלצות קונקרטיות ומעשיות`;
}
