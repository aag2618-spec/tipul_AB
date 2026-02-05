import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "@/lib/prisma";
import { getApproachById, getApproachPrompts } from "@/lib/therapeutic-approaches";

// Lazy initialization
let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export interface NoteAnalysis {
  summary: string;
  keyThemes: string[];
  clinicalObservations: string[];
  progressIndicators: {
    area: string;
    status: "improving" | "stable" | "concerning";
    notes: string;
  }[];
  suggestedInterventions: string[];
  questionsForNextSession: string[];
  riskFactors: string[];
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { noteContent, clientName, clientId } = body;

    if (!noteContent || noteContent.trim().length < 10) {
      return NextResponse.json(
        { message: "נא לכתוב סיכום מפורט יותר לפני הניתוח" },
        { status: 400 }
      );
    }

    // קבלת פרטי המשתמש כולל גישות טיפוליות
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        aiTier: true,
        therapeuticApproaches: true,
      }
    });

    console.log('🔍 ANALYZE NOTE - User data:', {
      userId: user?.id,
      aiTier: user?.aiTier,
      therapeuticApproaches: user?.therapeuticApproaches,
      clientIdReceived: clientId,
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
      console.log('🔍 ANALYZE NOTE - Client data:', {
        clientId,
        clientApproaches: client?.therapeuticApproaches,
      });
      if (client?.therapeuticApproaches && client.therapeuticApproaches.length > 0) {
        therapeuticApproaches = client.therapeuticApproaches;
      }
    }

    console.log('🔍 ANALYZE NOTE - Final approaches:', {
      therapeuticApproaches,
      isEnterprise: user.aiTier === 'ENTERPRISE',
      willUseApproaches: user.aiTier === 'ENTERPRISE' && therapeuticApproaches.length > 0,
    });

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

חובה לנתח את הפגישה לפי הגישה/ות הבאות. השתמש במושגים הספציפיים של הגישה!

${approachPrompts}

הנחיות חיוניות:
• כל הניתוח חייב להיות דרך העדשה של ${approachNames}
• ציין מושגים ספציפיים מהגישה (עם תרגום עברי אם באנגלית)
• ההמלצות חייבות להתבסס על הטכניקות של הגישה
• זהה דפוסים רלוונטיים לפי המסגרת התיאורטית

`;
      console.log('🔍 Analyze Note - Using approaches:', approachNames);
    }

    const model = getGenAI().getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `חשוב מאוד - כללי פורמט (חובה לציית):
- כתוב טקסט רגיל בלבד, ללא שום עיצוב
- אסור להשתמש ב-Markdown: ללא #, ללא **, ללא *, ללא _
- לכותרות: כתוב את הכותרת בשורה נפרדת עם נקודתיים בסוף
- לרשימות: השתמש בסימן • בלבד
- להפרדה: שורה ריקה בין סעיפים

אתה פסיכולוג קליני מנוסה. נתח את סיכום הפגישה הבא שנכתב על ידי מטפל והחזר ניתוח מקצועי מעמיק.

${clientName ? `שם המטופל: ${clientName}` : ""}
${approachSection}
סיכום הפגישה שנכתב:
${noteContent}

החזר את התשובה בפורמט JSON בלבד (ללא markdown או הסברים) עם המבנה הבא:
{
  "summary": "סיכום תמציתי של הנקודות העיקריות (2-3 משפטים)",
  "keyThemes": ["נושא מרכזי 1", "נושא מרכזי 2", ...],
  "clinicalObservations": ["תצפית קלינית 1", "תצפית קלינית 2", ...],
  "progressIndicators": [
    {
      "area": "תחום (למשל: חרדה, יחסים, עבודה)",
      "status": "improving" או "stable" או "concerning",
      "notes": "הערות על ההתקדמות בתחום"
    }
  ],
  "suggestedInterventions": ["התערבות מומלצת 1", "התערבות מומלצת 2", ...],
  "questionsForNextSession": ["שאלה לפגישה הבאה 1", "שאלה 2", ...],
  "riskFactors": ["גורם סיכון אם זוהה, או מערך ריק אם אין"]
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Try to parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response");
    }

    const analysis: NoteAnalysis = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Analyze note error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בניתוח הסיכום" },
      { status: 500 }
    );
  }
}
