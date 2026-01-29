import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateSessionSummary, analyzeText } from "@/lib/google-ai";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { transcription, summaries, clientName, analysisType } = body;

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

      const prompt = `אתה פסיכולוג מומחה. קיבלת ${summaries.length} סיכומי פגישות של מטופל${clientName ? ` בשם ${clientName}` : ""}.
      
ניתח בצורה מעמיקה את כל הפגישות ביחד וספק:

1. **סיכום כללי**: סקירה של מהלך הטיפול
2. **נושאים מרכזיים**: מה הנושאים החוזרים והמרכזיים בטיפול
3. **דפוסים זוהו**: התנהגויות, מחשבות או רגשות שחוזרים על עצמם
4. **התקדמות**: שינויים והתפתחות לאורך זמן
5. **תובנות טיפוליות**: מה ניתן ללמוד מהמהלך הכולל
6. **המלצות להמשך**: הצעות לכיוונים טיפוליים

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













