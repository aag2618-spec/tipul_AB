import { NextRequest, NextResponse } from "next/server";
import { generateSessionSummary, analyzeText } from "@/lib/google-ai";
import prisma from "@/lib/prisma";
import { getApproachById, getApproachPrompts, getUniversalPrompts } from "@/lib/therapeutic-approaches";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { sanitizeUserHtml, sanitizeAiText } from "@/lib/sanitize-html";
import { requireAiConsent } from "@/lib/ai-consent";
import { loadScopeUser, buildClientWhere, isSecretary } from "@/lib/scope";
import { getClientPseudonym } from "@/lib/ai-pseudonymize";
import { parseBody } from "@/lib/validations/helpers";
import { analyzeSummarySchema } from "@/lib/validations/analyze";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    // C2 + clinical block: SECRETARY חסומה מ-AI ניתוחים קליניים
    // (כותב comprehensiveAnalysis ל-Client — תוכן רפואי).
    const scopeUser = await loadScopeUser(userId);
    if (isSecretary(scopeUser)) {
      return NextResponse.json(
        { message: "פעולה זו אינה זמינה למזכירה" },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, analyzeSummarySchema);
    if ("error" in parsed) return parsed.error;
    // C3: לא משתמשים יותר ב-clientName מה-body. גם אם ה-UI שולח שם —
    // ה-prompt ל-Gemini מקבל pseudonym בלבד.
    const { transcription, summaries, clientId, analysisType } = parsed.data;

    const clientPseudo = getClientPseudonym(clientId ?? null);

    // קבלת פרטי המשתמש כולל גישות טיפוליות
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        aiTier: true,
        therapeuticApproaches: true,
      }
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    // קבלת גישות מהמטופל אם יש
    let therapeuticApproaches = user.therapeuticApproaches || [];

    let clientCulturalContext: string | null = null;
    if (clientId) {
      // C2: אימות בעלות על המטופל. תוקף לא יוכל יותר לקרוא culturalContext
      // ולא יוכל לדרוס את comprehensiveAnalysis (ראה גם המעבר ל-updateMany למטה).
      const client = await prisma.client.findFirst({
        where: { AND: [{ id: clientId }, buildClientWhere(scopeUser)] },
        select: { therapeuticApproaches: true, culturalContext: true },
      });
      if (!client) {
        return NextResponse.json(
          { message: "מטופל לא נמצא" },
          { status: 404 }
        );
      }
      if (client.therapeuticApproaches && client.therapeuticApproaches.length > 0) {
        therapeuticApproaches = client.therapeuticApproaches;
      }
      clientCulturalContext = client.culturalContext || null;

      // M1 + סבב 8 (Info Disclosure): consent רק אחרי scope check. בלי הסדר
      // הזה, תוקף שיודע clientId של ארגון אחר היה יכול לעורר 403 שמגלה את
      // ערך consentToAI של מטופל זר (הבדל בהודעת השגיאה: requiresConsent vs
      // "מטופל לא נמצא"). חוק 3 ב-feedback_security_fixes.md.
      const consent = await requireAiConsent(clientId);
      if (!consent.ok) return consent.response;
    }

    // בניית section של גישות טיפוליות - רק ל-ENTERPRISE
    let approachSection = '';
    if (user.aiTier === 'ENTERPRISE' && therapeuticApproaches.length > 0) {
      const approachNames = therapeuticApproaches
        .map(id => {
          const approach = getApproachById(id);
          return approach ? approach.nameHe : null;
        })
        .filter(Boolean)
        .join(", ");
      
      const approachPrompts = getApproachPrompts(therapeuticApproaches);
      
      approachSection = `
=== גישות טיפוליות מוגדרות: ${approachNames} ===

חובה לנתח את כל התוכן לפי הגישה/ות הבאות. השתמש במושגים הספציפיים של הגישה!

${approachPrompts}

הנחיות חיוניות:
• כל הניתוח חייב להיות דרך העדשה של ${approachNames}
• ציין מושגים ספציפיים מהגישה (עם תרגום עברי אם באנגלית)
• ההמלצות חייבות להתבסס על הטכניקות של הגישה

`;
    }

    // Case 1: Generate summary from transcription
    if (transcription) {
      // M3: sanitize — מסיר HTML שעלול להופיע ב-AI output.
      const summary = sanitizeAiText(await generateSessionSummary(transcription));
      return NextResponse.json({ summary });
    }

    // Case 2: Comprehensive analysis of multiple summaries
    if (summaries && analysisType === "comprehensive") {
      if (!summaries || summaries.length === 0) {
        return NextResponse.json(
          { message: "נא לספק סיכומים לניתוח" },
          { status: 400 }
        );
      }

      // H4: sanitize HTML של summaries[i].content לפני שליחה ל-LLM.
      // המקור הוא sessionNote.content (HTML מ-TipTap). אחרי המיגרציה
      // הוא יהיה מסונן ב-DB, אבל רישומים ישנים לא — לכן sanitize גם כאן.
      const summariesText = summaries
        .map((s) => `תאריך: ${s.date}\n${sanitizeUserHtml(s.content)}`)
        .join("\n\n---\n\n");

      const culturalSection = clientCulturalContext
        ? `\nהקשר תרבותי חשוב:\n${clientCulturalContext}\nשים לב: התאם את הניתוח להקשר התרבותי של המטופל.\n`
        : '';

      const prompt = `כללי פורמט (חובה):
- כתוב בעברית בלבד, מימין לשמאל
- מונחים מקצועיים: כתוב קודם בעברית, אנגלית בסוגריים
- ללא Markdown: ללא #, ללא **, ללא *, ללא _
- כותרות: בשורה נפרדת עם נקודתיים
- רשימות: סימן • בלבד
- הפרדה: שורה ריקה בין סעיפים

הנחיה: חפש את מה שהשתנה ואת מה שנשאר תקוע. חפש את הפרדוקסים.

אתה פסיכולוג קליני ברמה אקדמית גבוהה. קיבלת ${summaries.length} סיכומי פגישות של ${clientPseudo}.
${approachSection}
${culturalSection}
ניתח בצורה מעמיקה ברמה של פסיכולוג בכיר:

1. סיכום מהלך הטיפול:
• סקירה כוללת - היכן התחלנו, היכן אנחנו
• נקודות מפנה בטיפול

2. נושאים מרכזיים:
• נושאים חוזרים ומשמעותם
• נושאים שנעלמו - האם נפתרו או הודחקו?

3. דפוסים שזוהו:
• דפוסים רגשיים, התנהגותיים, ויחסיים
• מה חוזר שוב ושוב ולמה?

4. התקדמות לאורך זמן:
• שינויים חיוביים ומה אפשר אותם
• תחומים שנתקעו - למה?
• פרדוקסים: שיפור באזור אחד עם החמרה באחר

5. תובנות קליניות:
• מה ניתן ללמוד מהמהלך הכולל?
• דינמיקה טיפולית (ברית טיפולית - Therapeutic Alliance)

6. המלצות להמשך:
• כיוונים טיפוליים מומלצים
• מה לשים לב אליו

כל מונח אנגלי חייב להופיע עם תרגום פשוט בעברית.

${getUniversalPrompts()}

הסיכומים:

${summariesText}`;

      // M3: sanitize AI output לפני שמירה ב-comprehensiveAnalysis (יוצג ב-UI).
      const analysis = sanitizeAiText(await analyzeText(prompt));

      // C2: שמירת הניתוח רק על מטופל ששייך ל-scope של המשתמש.
      // updateMany עם buildClientWhere — אטומי ומונע IDOR גם אם הfindFirst
      // למעלה הוחלף בעתיד בטעות. כשל update לא נחשב שגיאה אם הניתוח כן הופק.
      if (clientId) {
        const updated = await prisma.client.updateMany({
          where: { AND: [{ id: clientId }, buildClientWhere(scopeUser)] },
          data: {
            comprehensiveAnalysis: analysis,
            comprehensiveAnalysisAt: new Date(),
          },
        });
        if (updated.count === 0) {
          logger.warn("[analyze/summary] update skipped — client not in scope", {
            userId,
            clientId,
          });
        }
      }

      return NextResponse.json({ analysis });
    }

    return NextResponse.json(
      { message: "נא לספק תמלול או סיכומים" },
      { status: 400 }
    );
  } catch (error) {
    logger.error("Generate summary error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הסיכום או הניתוח" },
      { status: 500 }
    );
  }
}

