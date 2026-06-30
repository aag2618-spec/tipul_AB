// חישוב ניקוד שאלון בצד-השרת — מקור האמת לקישור המילוי הציבורי.
//
// מקביל ל-calculateScore שבדף המילוי בתוך המערכת, אך *לא* סומך על ערכי score
// שהדפדפן שולח: מקבל רק את האפשרות שנבחרה (value) ושולף את הניקוד מהתבנית
// עצמה. כך מטופל לא יכול "לזייף" ציון.
//
// בונה מערך answers מיושר-אינדקס (כמו שהמטפל היה ממלא ידנית) כדי שדף הפירוט,
// ההדפסה ומנוע הפרשנות — שכולם קוראים answers[index] לפי מיקום השאלה —
// יעבדו בלי שום שינוי.

export interface TemplateQuestionLike {
  section?: string;
  options?: { value: number; text?: string; score?: number }[];
}

export type ScoredAnswer =
  | { value: number; text?: string; score?: number }
  | { text: string }
  | Record<string, never>; // {} = שאלה שלא נענתה (שומר יישור-אינדקס)

export interface ScoreResult {
  answers: ScoredAnswer[];
  totalScore: number;
  subscores: Record<string, number>;
}

// template.questions עשוי להיות [...] (חדש) או {questions:[...]} (פורמט ישן).
export function getTemplateQuestions(raw: unknown): TemplateQuestionLike[] {
  if (Array.isArray(raw)) return raw as TemplateQuestionLike[];
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { questions?: unknown[] }).questions)
  ) {
    return (raw as { questions: TemplateQuestionLike[] }).questions;
  }
  return [];
}

// selections = map של אינדקס-שאלה (כמחרוזת) → { value? } / { text? }.
export function scoreFromSelections(
  questions: TemplateQuestionLike[],
  selections: Record<string, { value?: number; text?: string }>
): ScoreResult {
  const answers: ScoredAnswer[] = [];
  let totalScore = 0;
  const subscores: Record<string, number> = {};

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const sel = selections[String(i)];

    // בחירה רב-ברירתית: שולפים את הניקוד מהתבנית (לא מהדפדפן).
    if (sel && typeof sel.value === "number" && Array.isArray(q.options)) {
      const option = q.options.find((o) => o.value === sel.value);
      if (option) {
        // score גובר על value אם הוגדר (כלים כמו AQ); אחרת value = הניקוד.
        const points = option.score ?? option.value;
        totalScore += points;
        if (q.section) {
          subscores[q.section] = (subscores[q.section] || 0) + points;
        }
        answers.push(
          option.score !== undefined
            ? { value: option.value, text: option.text, score: option.score }
            : { value: option.value, text: option.text }
        );
        continue;
      }
    }

    // שאלה פתוחה / דמוגרפית (טקסט חופשי) — לא תורמת לניקוד.
    if (sel && typeof sel.text === "string" && sel.text.trim()) {
      answers.push({ text: sel.text.trim() });
      continue;
    }

    // לא נענתה — מציין-מקום ריק כדי לשמר יישור-אינדקס מול השאלות.
    answers.push({});
  }

  return { answers, totalScore, subscores };
}
