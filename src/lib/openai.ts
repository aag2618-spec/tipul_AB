import OpenAI from 'openai';
import { getApproachPrompts, getApproachById } from './therapeutic-approaches';

// Lazy initialization
let openai: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

// Therapeutic approach prompts
const APPROACH_PROMPTS = {
  CBT: `
    אתה מומחה ב-CBT (קוגניטיבית-התנהגותית).
    התמקד במחשבות אוטומטיות, עיוותים קוגניטיביים, וקשרים בין מחשבות-רגשות-התנהגויות.
    הצע שיעורי בית התנהגותיים ומדידות של התקדמות.
  `,
  Psychodynamic: `
    אתה מומחה בגישה פסיכודינמית/פסיכואנליטית.
    חפש דפוסים לא מודעים, העברה, התנגדות, וקשרים לעבר.
    התייחס לדינמיקה הטיפולית והתהליך הפנימי של המטופל.
  `,
  ACT: `
    אתה מומחה ב-ACT (Acceptance & Commitment Therapy).
    התמקד בערכים, קבלה פסיכולוגית, defusion קוגניטיבי, ומחויבות לפעולה.
    הצע תרגילי מיינדפולנס ו-committed actions.
  `,
  DBT: `
    אתה מומחה ב-DBT (דיאלקטית-התנהגותית).
    התמקד ברגולציה רגשית, סובלנות למצוקה, מיומנויות בין-אישיות, ומיינדפולנס.
    שים דגש על אימות רגשי וחשיבה דיאלקטית.
  `,
  'Solution-Focused': `
    אתה מומחה בגישה ממוקדת פתרונות.
    התמקד בחוזקות, בהצלחות קטנות, ובעתיד הרצוי.
    שאל "מתי זה עובד טוב?" במקום "מה הבעיה?".
    הצע צעדים קטנים וממשיים.
  `,
  Humanistic: `
    אתה מומחה בגישה הומניסטית (רוג'רס).
    התמקד בקבלה ללא תנאי, אמפתיה, ואותנטיות.
    כבד את החוויה הסובייקטיבית של המטופל.
    עודד צמיחה עצמית ומימוש עצמי.
  `,
  Systemic: `
    אתה מומחה בגישה מערכתית/טיפול משפחתי.
    התמקד בדינמיקות בין-אישיות, דפוסי תקשורת, ומערכות יחסים.
    חפש דפוסים מחזוריים ואינטראקציות בין חברי המערכת.
  `,
  EMDR: `
    אתה מומחה ב-EMDR (עיבוד טראומות).
    התמקד בזיכרונות טראומטיים, triggers, ועיבוד של חוויות קשות.
    שים לב לרגולציה רגשית ומשאבי התמודדות.
  `,
  Mindfulness: `
    אתה מומחה בגישה מבוססת-מודעות ומיינדפולנס.
    התמקד בקבלה, נוכחות, והבחנה בין מחשבות למציאות.
    הצע תרגילי מודעות לרגע הנוכחי ולגוף.
  `,
  Gestalt: `
    אתה מומחה בגישת הגשטלט.
    התמקד במודעות להווה, באחריות אישית, ובשלמות (wholeness).
    שים לב למה שקורה "כאן ועכשיו" בחדר הטיפול.
  `,
  Existential: `
    אתה מומחה בגישה אקזיסטנציאלית.
    התמקד בשאלות של משמעות, חירות, אחריות, ומוות.
    חקור את החרדה האקזיסטנציאלית והבחירות של המטופל.
  `,
  Coaching: `
    אתה מומחה בקוצ'ינג ו-NLP.
    התמקד במטרות, תוצאות מדידות, ופעולות ממשיות.
    הצע כלים פרקטיים והתערבויות קצרות-טווח.
  `,
  Eclectic: `
    אתה מומחה בגישה אקלקטית/אינטגרטיבית.
    שלב טכניקות מגישות שונות בהתאם לצרכים.
    התאם את הניתוח לפי הסגנון הטיפולי המתואר.
  `,
};

export interface SessionPrepInput {
  clientName: string;
  recentNotes: Array<{
    date: string;
    content: string;
  }>;
  sessionDate: string;
  therapeuticApproaches: string[];
  approachDescription?: string;
  analysisStyle: string;
  tone: string;
  customInstructions?: string;
}

export interface SessionPrepOutput {
  content: string;
  insights: {
    keyThemes: string[];
    patterns: string[];
    progress: string;
  };
  recommendations: {
    focusAreas: string[];
    questions: string[];
    interventions: string[];
  };
  tokensUsed: number;
  cost: number;
}

export async function generateSessionPrep(
  input: SessionPrepInput,
  model: 'gpt-4o-mini' | 'gpt-4o' = 'gpt-4o-mini'
): Promise<SessionPrepOutput> {
  const client = getOpenAI();
  
  // Build system prompt based on approaches
  let systemPrompt = `אתה AI assistant מקצועי למטפל/ת נפש.`;
  
  // Use new comprehensive approach system
  if (input.therapeuticApproaches.length > 0) {
    systemPrompt += `\n\nהמטפל/ת עובד/ת בגישות הטיפוליות הבאות:\n`;
    const prompts = getApproachPrompts(input.therapeuticApproaches);
    if (prompts) {
      systemPrompt += prompts;
    } else {
      // Fallback to old system if approach not found in new list
      input.therapeuticApproaches.forEach(approach => {
        systemPrompt += APPROACH_PROMPTS[approach as keyof typeof APPROACH_PROMPTS] || '';
      });
    }
  }
  
  if (input.approachDescription) {
    systemPrompt += `\n\nתיאור הגישה האקלקטית של המטפל:\n${input.approachDescription}`;
  }
  
  systemPrompt += `\n\nסגנון הניתוח: ${input.analysisStyle}`;
  systemPrompt += `\nטון השפה: ${input.tone === 'formal' ? 'פורמלי ומקצועי' : input.tone === 'warm' ? 'חם ואמפתי' : 'ישיר ועניני'}`;
  
  if (input.customInstructions) {
    systemPrompt += `\n\nהוראות מותאמות אישית:\n${input.customInstructions}`;
  }
  
  systemPrompt += `\n\nתפקידך: לנתח את סיכומי הפגישות האחרונות ולהכין briefing מקצועי לפגישה הבאה.
  
כלול:
1. **הקשר** - מה קרה בפגישות האחרונות
2. **נושאים מרכזיים** - על מה המטופל מדבר
3. **דפוסים** - מה חוזר
4. **התקדמות** - מה השתנה
5. **המלצות לפגישה** - על מה לדבר, שאלות לשאול
6. **נקודות לשים לב** - דברים חשובים

**חשוב:** אל תזכיר משימות חסרות, חובות, או דברים שגורמים ללחץ. התמקד בתובנות חיוביות ושימושיות.

כתוב בעברית, בצורה מקצועית וברורה.`;

  // Build user prompt
  const userPrompt = `
מטופל/ת: ${input.clientName}
תאריך הפגישה הבאה: ${input.sessionDate}

סיכומי הפגישות האחרונות:
${input.recentNotes.map((note, i) => `
─────────────────────
פגישה ${i + 1} (${note.date}):
${note.content}
`).join('\n')}

כתוב briefing מקצועי להכנה לפגישה הבאה.`;

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });
    
    const content = completion.choices[0].message.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;
    
    // Calculate cost based on model
    const pricing = model === 'gpt-4o' 
      ? { input: 2.50, output: 10.00 } 
      : { input: 0.15, output: 0.60 };
    
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;
    const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
    
    // Parse insights (simple extraction for now)
    const insights = {
      keyThemes: [],
      patterns: [],
      progress: ''
    };
    
    const recommendations = {
      focusAreas: [],
      questions: [],
      interventions: []
    };
    
    return {
      content,
      insights,
      recommendations,
      tokensUsed,
      cost,
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error('Failed to generate session prep');
  }
}
