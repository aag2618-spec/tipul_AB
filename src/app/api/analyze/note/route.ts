import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
    const { noteContent, clientName } = body;

    if (!noteContent || noteContent.trim().length < 10) {
      return NextResponse.json(
        { message: "נא לכתוב סיכום מפורט יותר לפני הניתוח" },
        { status: 400 }
      );
    }

    const model = getGenAI().getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `אתה פסיכולוג קליני מנוסה. נתח את סיכום הפגישה הבא שנכתב על ידי מטפל והחזר ניתוח מקצועי מעמיק.

${clientName ? `שם המטופל: ${clientName}` : ""}

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
