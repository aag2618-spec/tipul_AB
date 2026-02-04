import { GoogleGenerativeAI } from '@google/generative-ai';
import { getApproachPrompts } from './therapeutic-approaches';

// Lazy initialization to ensure environment variable is available
let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY is not configured');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

// Updated model to Gemini 2.0 Flash (33x cheaper than Gemini 3 Pro!)
const DEFAULT_MODEL = 'gemini-2.0-flash';

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<{
  text: string;
  confidence?: number;
}> {
  // Check API key
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is not configured');
  }
  
  console.log('Starting transcription with mimeType:', mimeType);
  console.log('Audio data length:', audioBase64.length);
  console.log('API Key prefix:', apiKey.substring(0, 10) + '...');
  
  try {
    const model = getGenAI().getGenerativeModel({ model: DEFAULT_MODEL });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: audioBase64,
        },
      },
      {
        text: `תמלל את ההקלטה הזו לעברית. 
        אם יש יותר מדובר אחד, סמן אותם כ"מטפל:" ו"מטופל:".
        החזר רק את התמלול, בלי הערות נוספות.`,
      },
    ]);

    const response = await result.response;
    const text = response.text();
    
    console.log('Transcription successful, text length:', text.length);

    return {
      text,
      confidence: 0.95, // Gemini doesn't return confidence scores
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error && 'cause' in error ? String(error.cause) : '';
    console.error('Transcription error:', errorMessage, errorDetails, error);
    throw new Error(`Failed to transcribe audio: ${errorMessage}`);
  }
}

export async function transcribeAudioWithTimestamps(
  audioBase64: string,
  mimeType: string
): Promise<{
  text: string;
  segments: { start: number; end: number; text: string; speaker?: string }[];
}> {
  try {
    const model = getGenAI().getGenerativeModel({ model: DEFAULT_MODEL });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: audioBase64,
        },
      },
      {
        text: `תמלל את ההקלטה הזו לעברית עם חותמות זמן.
        פורמט הפלט צריך להיות JSON עם המבנה הבא:
        {
          "text": "הטקסט המלא",
          "segments": [
            { "start": 0, "end": 5, "text": "טקסט הקטע", "speaker": "מטפל" או "מטופל" }
          ]
        }
        החזר רק את ה-JSON, בלי הסברים נוספים.`,
      },
    ]);

    const response = await result.response;
    const jsonText = response.text();
    
    // Try to parse JSON from the response
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback if no JSON found
    return {
      text: jsonText,
      segments: [],
    };
  } catch (error) {
    console.error('Transcription with timestamps error:', error);
    throw new Error('Failed to transcribe audio with timestamps');
  }
}

// Session Analysis Types - Enhanced for approach-specific analysis
export interface SessionAnalysis {
  // Basic summary
  summary: string;
  approachUsed: string[];
  
  // Pattern identification
  patterns: {
    emotional: {
      pattern: string;
      evidence: string[];
      significance: string;
    }[];
    behavioral: {
      pattern: string;
      evidence: string[];
      significance: string;
    }[];
    relational: {
      pattern: string;
      evidence: string[];
      significance: string;
    }[];
    cognitive?: {
      pattern: string;
      evidence: string[];
      significance: string;
    }[];
  };
  
  // Core issue identified
  coreIssue: {
    description: string;
    approachPerspective: string;
    severity: 'mild' | 'moderate' | 'severe';
  };
  
  // Emotional markers (kept for backwards compatibility)
  emotionalMarkers: {
    emotion: string;
    intensity: 'low' | 'medium' | 'high';
    context: string;
  }[];
  
  // Strengths identified
  strengths: string[];
  
  // Key topics
  keyTopics: string[];
  
  // Approach-specific analysis (dynamic based on approach)
  approachAnalysis: Record<string, unknown>;
  
  // Recommendations with rationale
  recommendations: {
    recommendation: string;
    rationale: string;
    priority: 'high' | 'medium' | 'low';
  }[];
  
  // Next session focus
  nextSessionFocus: {
    topics: string[];
    goals: string[];
    techniques: string[];
  };
  
  // Legacy field for backwards compatibility
  nextSessionNotes: string;
}

export async function analyzeSession(
  transcription: string,
  approachIds: string[] = []
): Promise<SessionAnalysis> {
  try {
    const model = getGenAI().getGenerativeModel({ model: DEFAULT_MODEL });

    // Build approach-specific prompts
    let approachGuidance = '';
    let approachNames = 'כללי';
    
    if (approachIds.length > 0) {
      const approachPrompts = getApproachPrompts(approachIds);
      approachNames = approachIds.join(', ');
      approachGuidance = `
אתה מתמחה בגישות הטיפוליות הבאות בלבד:

${approachPrompts}

===== הוראות קריטיות =====
1. השתמש אך ורק במושגים, כלים וטכניקות של הגישות שצוינו למעלה.
2. אסור לך להשתמש במונחים מגישות אחרות!
3. כל הניתוח, הדפוסים, ההמלצות והערות לפגישה הבאה חייבים להיות בהתאם לגישות שנבחרו בלבד.
4. אם נבחרו מספר גישות - שלב ביניהן, אבל אל תוסיף גישות שלא נבחרו.
==============================
`;
    }

    const result = await model.generateContent([
      {
        text: `אתה פסיכולוג קליני מנוסה עם מומחיות עמוקה. ${approachGuidance}

נתח את תמלול הפגישה הטיפולית הבא והחזר ניתוח מקצועי מעמיק${approachIds.length > 0 ? ' בהתאם לגישות שצוינו בלבד' : ''}.

תמלול הפגישה:
${transcription}

החזר את התשובה בפורמט JSON עם המבנה המפורט הבא:
{
  "summary": "סיכום מקצועי של הפגישה (3-4 משפטים) לפי הגישה/ות שנבחרו",
  "approachUsed": ${JSON.stringify(approachIds.length > 0 ? approachIds : ['general'])},
  
  "patterns": {
    "emotional": [
      {
        "pattern": "תיאור הדפוס הרגשי שזוהה",
        "evidence": ["ראיה 1 מהטקסט", "ראיה 2"],
        "significance": "משמעות הדפוס לפי הגישה הטיפולית"
      }
    ],
    "behavioral": [
      {
        "pattern": "תיאור הדפוס ההתנהגותי שזוהה",
        "evidence": ["ראיה 1 מהטקסט", "ראיה 2"],
        "significance": "משמעות הדפוס לפי הגישה הטיפולית"
      }
    ],
    "relational": [
      {
        "pattern": "תיאור הדפוס היחסי/בין-אישי שזוהה",
        "evidence": ["ראיה 1 מהטקסט", "ראיה 2"],
        "significance": "משמעות הדפוס לפי הגישה הטיפולית"
      }
    ]${approachIds.some(id => id.includes('cbt') || id.includes('beck') || id.includes('ellis')) ? `,
    "cognitive": [
      {
        "pattern": "מחשבה אוטומטית / עיוות קוגניטיבי / אמונה",
        "evidence": ["ראיה 1 מהטקסט", "ראיה 2"],
        "significance": "משמעות לפי CBT"
      }
    ]` : ''}
  },
  
  "coreIssue": {
    "description": "תיאור הבעיה/קונפליקט המרכזי שעולה מהפגישה",
    "approachPerspective": "פרשנות לפי הגישה הטיפולית שנבחרה",
    "severity": "mild/moderate/severe"
  },
  
  "emotionalMarkers": [
    {
      "emotion": "שם הרגש",
      "intensity": "low/medium/high",
      "context": "ההקשר בו הרגש הופיע"
    }
  ],
  
  "strengths": ["חוזקה 1 שזוהתה", "חוזקה 2"],
  
  "keyTopics": ["נושא מרכזי 1", "נושא מרכזי 2"],
  
  "approachAnalysis": {
    // ניתוח ספציפי לפי הגישה שנבחרה
    // אם נבחרה CBT: כלול automaticThoughts, cognitiveDistortions, coreBeliefs, maintenanceCycle
    // אם נבחרה Mahler: כלול developmentalStage, separationIssues, objectConstancy
    // אם נבחרה Bowlby: כלול attachmentStyle, internalWorkingModels
    // אם נבחרה Klein: כלול position, splitting, projectiveIdentification
    // אם נבחרה Yalom: כלול existentialConcerns, authenticityLevel
    // וכו' - התאם לגישה הספציפית!
  },
  
  "recommendations": [
    {
      "recommendation": "המלצה ספציפית לפי הגישה",
      "rationale": "למה זה יעזור - הסבר תיאורטי",
      "priority": "high/medium/low"
    }
  ],
  
  "nextSessionFocus": {
    "topics": ["נושא לעבודה בפגישה הבאה"],
    "goals": ["מטרה לפגישה הבאה"],
    "techniques": ["טכניקה מומלצת מהגישה שנבחרה"]
  },
  
  "nextSessionNotes": "סיכום קצר של נקודות לפגישה הבאה"
}

חשוב מאוד:
- החזר רק JSON תקין, בלי הסברים נוספים.
- וודא שכל הניתוח מבוסס על הגישה/ות שנבחרו בלבד: ${approachNames}
- אל תערבב מונחים מגישות אחרות!`,
      },
    ]);

    const response = await result.response;
    const content = response.text();

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Ensure backwards compatibility - convert new format to include legacy fields if missing
      if (!parsed.nextSessionNotes && parsed.nextSessionFocus) {
        parsed.nextSessionNotes = parsed.nextSessionFocus.topics?.join(', ') || '';
      }
      
      // Convert recommendations to legacy format if needed for backwards compatibility
      if (parsed.recommendations && parsed.recommendations[0]?.recommendation) {
        // New format - keep as is
      } else if (parsed.recommendations && typeof parsed.recommendations[0] === 'string') {
        // Legacy format - convert
        parsed.recommendations = parsed.recommendations.map((rec: string) => ({
          recommendation: rec,
          rationale: '',
          priority: 'medium' as const
        }));
      }
      
      return parsed;
    }

    throw new Error('No valid JSON in response');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Analysis error:', errorMessage, error);
    throw new Error(`Failed to analyze session: ${errorMessage}`);
  }
}

export async function generateSessionSummary(
  transcription: string,
  approachIds: string[] = []
): Promise<string> {
  try {
    const model = getGenAI().getGenerativeModel({ model: DEFAULT_MODEL });

    // Build approach-specific prompts
    let approachGuidance = '';
    if (approachIds.length > 0) {
      const approachPrompts = getApproachPrompts(approachIds);
      approachGuidance = `
אתה מתמחה בגישות הטיפוליות הבאות:

${approachPrompts}

חשוב: כתוב את הסיכום בהתאם לגישות שצוינו, תוך שימוש במושגים והמסגרת המקצועית שלהן.
`;
    }

    const result = await model.generateContent([
      {
        text: `אתה פסיכולוג קליני מנוסה. ${approachGuidance}

כתוב סיכום מקצועי קצר של הפגישה הטיפולית הבאה.
הסיכום צריך להיות בגוף שלישי, מקצועי, ומתאים לתיעוד רפואי.

תמלול הפגישה:
${transcription}

כתוב סיכום של 3-5 משפטים.`,
      },
    ]);

    const response = await result.response;
    return response.text();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Summary generation error:', errorMessage, error);
    throw new Error(`Failed to generate summary: ${errorMessage}`);
  }
}

export async function analyzeIntake(transcription: string): Promise<{
  clientProfile: {
    presentingIssues: string[];
    background: string;
    goals: string[];
  };
  recommendations: string[];
  riskFactors: string[];
}> {
  try {
    const model = getGenAI().getGenerativeModel({ model: DEFAULT_MODEL });

    const result = await model.generateContent([
      {
        text: `אתה פסיכולוג קליני מנוסה. נתח את שיחת הקבלה/פתיחת תיק הבאה ובנה פרופיל ראשוני של המטופל.

תמלול השיחה:
${transcription}

החזר את התשובה בפורמט JSON עם המבנה הבא:
{
  "clientProfile": {
    "presentingIssues": ["בעיה 1", "בעיה 2", ...],
    "background": "רקע קצר על המטופל",
    "goals": ["מטרה 1", "מטרה 2", ...]
  },
  "recommendations": ["המלצה לטיפול 1", "המלצה 2", ...],
  "riskFactors": ["גורם סיכון 1", ...] // אם אין - מערך ריק
}

החזר רק את ה-JSON, בלי הסברים נוספים.`,
      },
    ]);

    const response = await result.response;
    const content = response.text();

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('No valid JSON in response');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Intake analysis error:', errorMessage, error);
    throw new Error(`Failed to analyze intake: ${errorMessage}`);
  }
}

// Generic text analysis function
export async function analyzeText(prompt: string): Promise<string> {
  try {
    const model = getGenAI().getGenerativeModel({ model: DEFAULT_MODEL });

    const result = await model.generateContent([
      {
        text: prompt,
      },
    ]);

    const response = await result.response;
    return response.text();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Text analysis error:', errorMessage, error);
    throw new Error(`Failed to analyze text: ${errorMessage}`);
  }
}








