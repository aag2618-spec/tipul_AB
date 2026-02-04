import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { getApproachPrompts, getApproachById } from "@/lib/therapeutic-approaches";

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
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

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
    // מחפשים הכנה שנוצרה באותו יום
    const targetDate = sessionDate ? new Date(sessionDate) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingPrep = await prisma.sessionPrep.findFirst({
      where: {
        clientId,
        userId: session.user.id,
        createdAt: {
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
    console.error("שגיאה בקבלת הכנה לפגישה:", error);
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

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
      where: { id: session.user.id },
      include: { aiUsageStats: true }
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

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

    // בדיקת מגבלות שימוש
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

    // קבלת פרטי המטופל
    const client = await prisma.client.findUnique({
      where: { id: clientId }
    });

    if (!client || client.therapistId !== session.user.id) {
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

    // קבלת גישות טיפוליות (של המטופל או ברירת מחדל)
    const therapeuticApproaches = (client.therapeuticApproaches && client.therapeuticApproaches.length > 0)
      ? client.therapeuticApproaches
      : (user.therapeuticApproaches || []);

    // בניית ה-prompt לפי התוכנית
    let prompt: string;
    
    if (user.aiTier === 'ENTERPRISE') {
      // תוכנית ארגונית - הכנה מפורטת עם גישות
      const approachPrompts = getApproachPrompts(therapeuticApproaches);
      const approachNames = therapeuticApproaches
        .map(id => {
          const approach = getApproachById(id);
          return approach ? approach.nameHe : null;
        })
        .filter(Boolean)
        .join(", ");
      
      prompt = buildEnterprisePrompt(
        client.name,
        sessionDate || format(new Date(), 'dd/MM/yyyy', { locale: he }),
        recentNotes,
        approachNames,
        approachPrompts,
        client.approachNotes
      );
    } else {
      // תוכנית מקצועית - הכנה תמציתית
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
        userId: session.user.id,
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
    
    await prisma.aIUsageStats.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
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
        totalCost: { increment: cost }
      }
    });

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

  } catch (error: any) {
    console.error('שגיאה בהכנה לפגישה:', error);
    return NextResponse.json(
      { message: error.message || "שגיאה פנימית בשרת" },
      { status: 500 }
    );
  }
}

/**
 * בניית prompt לתוכנית מקצועית (תמציתי)
 */
function buildProfessionalPrompt(
  clientName: string,
  sessionDate: string,
  recentNotes: Array<{date: string, content: string}>
): string {
  const notesText = recentNotes
    .map((note, i) => `פגישה ${i + 1} (${note.date}):\n${note.content}`)
    .join('\n\n---\n\n');

  return `אתה פסיכולוג מומחה המכין מטפל לפגישה הקרובה.

## פרטים:
- מטופל: ${clientName}
- תאריך הפגישה הקרובה: ${sessionDate}

## סיכומי הפגישות האחרונות:
${notesText}

---

## הנחיות:
הכן סיכום תמציתי להכנה לפגישה (200-300 מילים).

### מבנה התשובה:

**סיכום המצב:**
(3-4 שורות - מה הנושאים המרכזיים שעולים?)

**נקודות מפתח להמשך:**
• נקודה 1
• נקודה 2
• נקודה 3

**המלצות לפגישה:**
• המלצה 1
• המלצה 2

**שאלות מוצעות:**
• שאלה 1
• שאלה 2

---

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
  clientApproachNotes?: string | null
): string {
  const notesText = recentNotes
    .map((note, i) => `פגישה ${i + 1} (${note.date}):\n${note.content}`)
    .join('\n\n---\n\n');

  return `אתה פסיכולוג מומחה ברמה אקדמית גבוהה המכין מטפל לפגישה הקרובה.

## פרטים:
- מטופל: ${clientName}
- תאריך הפגישה הקרובה: ${sessionDate}
- גישות טיפוליות: ${approachNames || "גישה אקלקטית"}

${clientApproachNotes ? `## הערות על הגישה למטופל זה:\n${clientApproachNotes}\n` : ""}

## סיכומי הפגישות האחרונות:
${notesText}

---

## הנחיות מפורטות לפי הגישות הטיפוליות:

${approachPrompts || "השתמש בגישה אקלקטית-אינטגרטיבית."}

---

## הנחיות:
הכן הכנה מפורטת לפגישה (400-600 מילים).

### מבנה התשובה:

**1. סיכום המצב הנוכחי:**
(4-5 שורות - מה עולה מהפגישות האחרונות?)

**2. תובנות מרכזיות:**
• תובנה 1 - פירוט
• תובנה 2 - פירוט
• תובנה 3 - פירוט

**3. ניתוח לפי הגישה (${approachNames || "אקלקטית"}):**
(השתמש במושגים ובמסגרת הניתוח של הגישה!)
• נקודה 1 לפי הגישה
• נקודה 2 לפי הגישה
• מושגים מהגישה שרלוונטיים

**4. המלצות לפגישה הקרובה:**
• המלצה 1 - מה לעשות
• המלצה 2 - מה לעשות
• טכניקות ספציפיות מומלצות

**5. שאלות מוצעות:**
• שאלה 1 - מתאימה לגישה
• שאלה 2 - מתאימה לגישה
• שאלה 3 - לחקירה

**6. נקודות לתשומת לב:**
• על מה לשים לב בפגישה
• סימנים חיוביים לחפש
• אתגרים אפשריים

---

## כללים חשובים:
✅ כתוב בעברית בלבד (למעט מונחים מקצועיים)
✅ מונחים באנגלית - הוסף תרגום עברי בשורה נפרדת
✅ השתמש במושגים מהגישה הטיפולית
✅ היה ספציפי ומעשי`;
}

/**
 * חילוץ סעיף מהתוכן
 */
function extractSection(content: string, sectionName: string): string | null {
  const regex = new RegExp(`\\*\\*[^*]*${sectionName}[^*]*\\*\\*[:\\s]*([\\s\\S]*?)(?=\\*\\*|$)`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}
