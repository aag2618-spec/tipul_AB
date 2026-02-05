import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateSessionSummary, analyzeText } from "@/lib/google-ai";
import prisma from "@/lib/prisma";
import { getApproachById, getApproachPrompts } from "@/lib/therapeutic-approaches";

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
    
    if (clientId) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { therapeuticApproaches: true }
      });
      if (client?.therapeuticApproaches && client.therapeuticApproaches.length > 0) {
        therapeuticApproaches = client.therapeuticApproaches;
      }
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

      const prompt = `חשוב מאוד - כללי פורמט (חובה לציית):
- כתוב טקסט רגיל בלבד, ללא שום עיצוב
- אסור להשתמש ב-Markdown: ללא #, ללא **, ללא *, ללא _
- לכותרות: כתוב את הכותרת בשורה נפרדת עם נקודתיים בסוף
- לרשימות: השתמש בסימן • בלבד
- להפרדה: שורה ריקה בין סעיפים

אתה פסיכולוג מומחה. קיבלת ${summaries.length} סיכומי פגישות של מטופל${clientName ? ` בשם ${clientName}` : ""}.
${approachSection}
ניתח בצורה מעמיקה את כל הפגישות ביחד וספק:

1. סיכום כללי: סקירה של מהלך הטיפול
2. נושאים מרכזיים: מה הנושאים החוזרים והמרכזיים בטיפול
3. דפוסים זוהו: התנהגויות, מחשבות או רגשות שחוזרים על עצמם
4. התקדמות: שינויים והתפתחות לאורך זמן
5. תובנות טיפוליות: מה ניתן ללמוד מהמהלך הכולל
6. המלצות להמשך: הצעות לכיוונים טיפוליים

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













