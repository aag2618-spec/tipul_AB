// AI Prompt Pseudonymization
// ===========================
// מטרת המודול: מניעת שליחת שמות מטופלים אמיתיים, תאריכי לידה ומזהים
// אחרים שמאפשרים זיהוי ל-LLM צד שלישי (Google Gemini, Anthropic).
//
// במערכת רפואית עם חיסיון רפואי מקסימלי, אסור להעביר PHI/PII לעיבוד
// צד שלישי בלי DPA ייעודי. גם אם יש DPA — minimization principle של GDPR
// וחוק הגנת הפרטיות דורש שלא להעביר יותר ממה שצריך.
//
// ה-LLM לא זקוק לשם המטופל לניתוח קליני — מספיק מזהה placeholder עקבי.

/**
 * מחזיר pseudonym דטרמיניסטי למטופל. עקבי ליישות אחת לאורך זמן (ניתן
 * להתייחס ל-"המטופל-abc12345" לאורך הניתוח) אבל לא חושף PII.
 *
 * שימוש בסוף ה-clientId (CUID/UUID) — ה-prefix של CUID מכיל timestamp
 * ולכן יכול לרמז על תאריך יצירת הרשומה; הסוף הוא random bits נטו.
 *
 * @example
 *   getClientPseudonym("cm5xj9abc123def456") → "מטופל-23def456"
 */
export function getClientPseudonym(clientId: string | null | undefined): string {
  if (!clientId) return "המטופל";
  const tail = clientId.slice(-8);
  return `מטופל-${tail}`;
}

/**
 * מחזיר pseudonym לפגישה — שימושי כש-prompt מתייחס לפגישה מסוימת.
 *
 * @example
 *   getSessionPseudonym("cm5xj9...") → "פגישה-23def456"
 */
export function getSessionPseudonym(sessionId: string | null | undefined): string {
  if (!sessionId) return "הפגישה";
  const tail = sessionId.slice(-8);
  return `פגישה-${tail}`;
}

/**
 * ממיר תאריך לידה לטווח גילאים — במקום לשלוח תאריך מדויק (ש מאפשר זיהוי
 * בשילוב עם metadata אחרת), מחזיר טווח של 5 שנים.
 *
 * @example
 *   ageRangeFromBirthDate(new Date("1990-05-12")) → "30-35"
 */
export function ageRangeFromBirthDate(birthDate: Date | string | null | undefined): string | null {
  if (!birthDate) return null;
  const d = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  if (age < 0 || age > 130) return null;
  const lower = Math.floor(age / 5) * 5;
  return `${lower}-${lower + 5}`;
}
