import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateSessionSummary, analyzeText } from "@/lib/google-ai";
import prisma from "@/lib/prisma";
import { getApproachById, getApproachPrompts, getUniversalPrompts } from "@/lib/therapeutic-approaches";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { transcription, summaries, clientName, clientId, analysisType } = body;

    // קבלת פרטי המשתמש כולל גישות טיפוליות
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
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
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { therapeuticApproaches: true, culturalContext: true }
      });
      if (client?.therapeuticApproaches && client.therapeuticApproaches.length > 0) {
        therapeuticApproaches = client.therapeuticApproaches;
      }
      clientCulturalContext = client?.culturalContext || null;
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
      const summary = await generateSessionSummary(transcription);
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

      // Build the prompt for comprehensive analysis
      const summariesText = summaries
        .map((s: any) => `תאריך: ${s.date}\n${s.content}`)
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

אתה פסיכולוג קליני ברמה אקדמית גבוהה. קיבלת ${summaries.length} סיכומי פגישות של מטופל${clientName ? ` בשם ${clientName}` : ""}.
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

      const analysis = await analyzeText(prompt);
      return NextResponse.json({ analysis });
    }

    return NextResponse.json(
      { message: "נא לספק תמלול או סיכומים" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Generate summary error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הסיכום או הניתוח" },
      { status: 500 }
    );
  }
}













