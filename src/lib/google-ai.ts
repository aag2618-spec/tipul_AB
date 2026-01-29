import { GoogleGenerativeAI } from '@google/generative-ai';

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
    const model = getGenAI().getGenerativeModel({ model: 'gemini-3-pro-preview' });

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
    const model = getGenAI().getGenerativeModel({ model: 'gemini-3-pro-preview' });

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

// Session Analysis Types
export interface SessionAnalysis {
  summary: string;
  keyTopics: string[];
  emotionalMarkers: {
    emotion: string;
    intensity: 'low' | 'medium' | 'high';
    context: string;
  }[];
  recommendations: string[];
  nextSessionNotes: string;
}

export async function analyzeSession(transcription: string): Promise<SessionAnalysis> {
  try {
    const model = getGenAI().getGenerativeModel({ model: 'gemini-3-pro-preview' });

    const result = await model.generateContent([
      {
        text: `אתה פסיכולוג קליני מנוסה. נתח את תמלול הפגישה הטיפולית הבא והחזר ניתוח מובנה.

תמלול הפגישה:
${transcription}

החזר את התשובה בפורמט JSON עם המבנה הבא:
{
  "summary": "סיכום קצר של הפגישה (2-3 משפטים)",
  "keyTopics": ["נושא 1", "נושא 2", ...],
  "emotionalMarkers": [
    {
      "emotion": "שם הרגש",
      "intensity": "low" | "medium" | "high",
      "context": "ההקשר בו הרגש הופיע"
    }
  ],
  "recommendations": ["המלצה 1", "המלצה 2", ...],
  "nextSessionNotes": "נקודות לדיון בפגישה הבאה"
}

החזר רק את ה-JSON, בלי הסברים נוספים.`,
      },
    ]);

    const response = await result.response;
    const content = response.text();

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('No valid JSON in response');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Analysis error:', errorMessage, error);
    throw new Error(`Failed to analyze session: ${errorMessage}`);
  }
}

export async function generateSessionSummary(transcription: string): Promise<string> {
  try {
    const model = getGenAI().getGenerativeModel({ model: 'gemini-3-pro-preview' });

    const result = await model.generateContent([
      {
        text: `אתה פסיכולוג קליני מנוסה. כתוב סיכום מקצועי קצר של הפגישה הטיפולית הבאה.
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
    const model = getGenAI().getGenerativeModel({ model: 'gemini-3-pro-preview' });

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
    const model = getGenAI().getGenerativeModel({ model: 'gemini-3-pro-preview' });

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








