import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "@/lib/prisma";
import { getApproachById, getApproachPrompts, buildIntegrationSection, getScalesPrompt, getUniversalPrompts } from "@/lib/therapeutic-approaches";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

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

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

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
      where: { id: userId },
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
    let clientCulturalContext: string | null = null;
    
    if (clientId) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { therapeuticApproaches: true, culturalContext: true }
      });
      console.log('🔍 ANALYZE NOTE - Client data:', {
        clientId,
        clientApproaches: client?.therapeuticApproaches,
      });
      if (client?.therapeuticApproaches && client.therapeuticApproaches.length > 0) {
        therapeuticApproaches = client.therapeuticApproaches;
      }
      clientCulturalContext = client?.culturalContext || null;
    }

    console.log('🔍 ANALYZE NOTE - Final approaches:', {
      therapeuticApproaches,
      isEnterprise: user.aiTier === 'ENTERPRISE',
      willUseApproaches: user.aiTier === 'ENTERPRISE' && therapeuticApproaches.length > 0,
    });

    // בניית שמות הגישות
    const approachNames = therapeuticApproaches
      .map(id => {
        const approach = getApproachById(id);
        return approach ? approach.nameHe : null;
      })
      .filter(Boolean)
      .join(", ");

    // בניית section של גישות טיפוליות - רק ל-ENTERPRISE
    let approachSection = '';
    if (user.aiTier === 'ENTERPRISE' && therapeuticApproaches.length > 0) {
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

    // בניית prompt מותאם לפי רמת הפירוט
    const isEnterprise = user.aiTier === 'ENTERPRISE' && therapeuticApproaches.length > 0;
    
    const prompt = isEnterprise 
      ? buildEnterpriseAnalysisPrompt(clientName, approachSection, noteContent, approachNames, therapeuticApproaches, clientCulturalContext)
      : buildBasicAnalysisPrompt(clientName, noteContent);

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
    logger.error("Analyze note error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בניתוח הסיכום" },
      { status: 500 }
    );
  }
}

/**
 * בניית prompt מפורט לתוכנית ארגונית - ניתוח עמוק לפי הגישה
 * גרסה 3.0 - כולל Red Flags, סולמות, אינטגרציה, רגישות תרבותית
 */
function buildEnterpriseAnalysisPrompt(
  clientName: string | undefined,
  approachSection: string,
  noteContent: string,
  approachNames: string,
  approachIds?: string[],
  culturalContext?: string | null
): string {
  // בניית section אינטגרציה אם נבחרו מספר גישות
  const integrationSection = approachIds ? buildIntegrationSection(approachIds) : '';
  const scalesSection = approachIds ? getScalesPrompt(approachIds) : '';
  const universalSection = getUniversalPrompts();

  return `כללי פורמט (חובה):
- כתוב בעברית בלבד, מימין לשמאל
- מונחים מקצועיים: כתוב קודם בעברית, אנגלית בסוגריים. דוגמה: "הזדהות השלכתית (Projective Identification)"
- ללא Markdown: ללא #, ללא **, ללא *, ללא _
- כותרות: בשורה נפרדת עם נקודתיים
- רשימות: סימן • בלבד

הנחיה חשובה: תתעלם מהתשובה ה"מובנת מאליה" וחפש את הפרדוקס.

אתה פסיכולוג קליני מומחה ברמה אקדמית גבוהה.
המשימה: סיכום וניתוח מעמיק של פגישה שכבר התקיימה.

${clientName ? `שם המטופל: ${clientName}` : ""}
${approachSection}
${integrationSection}
${universalSection}
${culturalContext ? `\nהקשר תרבותי חשוב:\n${culturalContext}\nשים לב: אל תפרש התנהגות שהיא נורמטיבית בהקשר התרבותי של המטופל כפתולוגיה. התאם את הניתוח בהתאם.\n` : ""}
סיכום הפגישה שנכתב על ידי המטפל:
${noteContent}

חובה: כל הניתוח דרך העדשה של ${approachNames}.
כל מונח אנגלי חייב להופיע עם תרגום והסבר פשוט בעברית.

החזר JSON בלבד:

{
  "summary": "סיכום מקיף (5-7 משפטים) - מה עלה, מה נחקר, והמשמעות לפי ${approachNames}",

  "therapeuticStage": {
    "currentStage": "שלב לפי ${approachNames} (בעברית + מונח אנגלי בסוגריים)",
    "stageIndicators": "ראיות מהפגישה",
    "stageProgress": "תנועה או התבססות"
  },

  "sessionDeepAnalysis": {
    "whatActuallyHappened": "התהליך הפנימי - לא רק העובדות",
    "therapeuticMoments": "רגעים טיפוליים משמעותיים",
    "whatWasNotSaid": "מה לא נאמר? מעברי נושא חשודים, שתיקות, הימנעויות",
    "patientExperience": "מה המטופל חווה לפי ${approachNames}",
    "relationshipDynamics": "איך התפתח הקשר הטיפולי"
  },

  "keyThemes": ["נושא 1 (עם פרשנות לפי הגישה)", "נושא 2", "נושא 3"],

  "approachAnalysis": {
    "conceptsObserved": [
      {
        "conceptHe": "שם המושג בעברית",
        "conceptEn": "שם המושג באנגלית",
        "simpleExplanation": "הסבר פשוט במשפט אחד למטפל מתחיל",
        "observation": "איך המושג התבטא בפגישה",
        "significance": "המשמעות הטיפולית"
      }
    ],
    "redFlagsDetected": ["סימנים מחשידים שזוהו לפי כללי הגישה"],
    "newInsights": "מה התחדש בהבנת המטופל",
    "progressInApproach": "התקדמות במושגי ${approachNames}"
  },

  ${(approachIds?.length ?? 0) > 1 ? `"integrationAnalysis": {
    "convergences": "איפה הגישות מאירות את אותו דבר מזוויות שונות",
    "uniqueContributions": "מה כל גישה תורמת שרק היא יכולה",
    "paradoxes": "סתירות מעניינות בין הגישות שמעמיקות את ההבנה"
  },` : ''}

  "topicShiftsAnalysis": {
    "shifts": ["מעבר נושא חשוד 1 - מה הנושא שנמנע?"],
    "defenseMechanisms": [
      {
        "defenseHe": "שם ההגנה בעברית",
        "defenseEn": "שם ההגנה באנגלית",
        "simpleExplanation": "הסבר פשוט",
        "manifestation": "איך התבטא",
        "approachPerspective": "פרשנות לפי ${approachNames}"
      }
    ]
  },

  "transferenceAnalysis": {
    "transference": {
      "type": "סוג ההעברה (עברית + אנגלית)",
      "manifestation": "איך התבטאה",
      "meaning": "משמעות לפי ${approachNames}"
    },
    "countertransference": {
      "feelings": "מה המטפל עלול לחוות",
      "meaning": "משמעות לפי ${approachNames}",
      "recommendation": "איך להשתמש בזה טיפולית"
    }
  },

  "quantitativeAssessment": [
    {
      "scaleName": "שם הסולם (עברית + אנגלית)",
      "score": "1-10",
      "evidence": "ראיות לדירוג",
      "trend": "עלייה/ירידה/יציבות לעומת פגישות קודמות"
    }
  ],

  "blindSpots": {
    "possibleMisses": ["מה המטפל אולי פיספס"],
    "unexploredAreas": ["תחום שלא נחקר מספיק"],
    "alternativeInterpretations": "פרשנות חלופית"
  },

  "progressIndicators": [
    {
      "area": "תחום לפי מושגי ${approachNames}",
      "status": "improving/stable/concerning",
      "notes": "פירוט"
    }
  ],

  "clinicalObservations": ["תצפית 1", "תצפית 2"],

  "recommendations": {
    "keyTakeaways": ["מסקנה 1", "מסקנה 2"],
    "interventions": [
      {
        "intervention": "התערבות מומלצת (עברית + אנגלית)",
        "rationale": "למה זה מתאים לפי ${approachNames}",
        "howTo": "איך לבצע בפועל"
      }
    ],
    "questionsForNext": [
      {
        "question": "שאלה מנוסחת לפי סגנון ${approachNames}",
        "purpose": "מה רוצים לברר"
      }
    ],
    "therapeuticStance": "עמדה טיפולית מומלצת לפי ${approachNames}",
    "whatToAvoid": "ממה להיזהר"
  },

  "riskFactors": []
}`;
}

/**
 * בניית prompt בסיסי לתוכניות רגילות
 */
function buildBasicAnalysisPrompt(
  clientName: string | undefined,
  noteContent: string
): string {
  return `חשוב מאוד - כללי פורמט (חובה לציית):
- כתוב טקסט רגיל בלבד, ללא שום עיצוב
- אסור להשתמש ב-Markdown: ללא #, ללא **, ללא *, ללא _
- לכותרות: כתוב את הכותרת בשורה נפרדת עם נקודתיים בסוף
- לרשימות: השתמש בסימן • בלבד
- להפרדה: שורה ריקה בין סעיפים

אתה פסיכולוג קליני מנוסה. נתח את סיכום הפגישה הבא שנכתב על ידי מטפל והחזר ניתוח מקצועי.

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
}
