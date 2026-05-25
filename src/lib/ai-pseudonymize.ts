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

// ============================================================================
// R3 (סבב 17c, 2026-05-20) — PII Redaction לפני שליחה ל-Gemini
// ============================================================================
//
// המוטיבציה: שדות טקסט חופשי שמטפל כותב (sessionNote.content, culturalContext,
// approachNotes, intake answers) עלולים להכיל PII זיהויי — ת"ז, טלפונים,
// אימיילים, מספרי דרכון. גם אם DPA חתום מול Google, חוק הגנת הפרטיות + GDPR
// data-minimization דורש שלא לשלוח יותר ממה שצריך.
//
// פסידונים של שם/תאריך (`getClientPseudonym`, `ageRangeFromBirthDate`) כבר
// מטפל ב-PII מובנה. כאן ה-strip של PII *בתוך* הטקסט החופשי.
//
// אסטרטגיה: redact regex-based — מהיר, deterministic, אין call ל-LLM.
// FAIL-SOFT — אם regex לא תופס, ה-pseudonym layer של שם מטופל עדיין שם.
//
// **לא מנסה לזהות שמות.** זיהוי שמות בעברית דורש NLP/named-entity-recognition
// שיקר ולא דטרמיניסטי. הסתמכות על שיפוט המטפל לגבי שמות + pseudonym על
// client.name שמופיע בכותרת ה-prompt.

const REDACTION = {
  ID: "[ת.ז.]",
  PHONE: "[טלפון]",
  EMAIL: "[אימייל]",
  CARD: "[כרטיס_אשראי]",
} as const;

/**
 * מסיר PII זיהויי מטקסט חופשי לפני שליחה ל-LLM צד שלישי.
 *
 * תופס:
 *   • Israeli ID — 9 ספרות רצופות (עם או בלי מקף)
 *   • טלפונים — פורמטים ישראליים (05X-XXXXXXX, 0X-XXXXXXX, +972, 972) +
 *     בינלאומי בסיסי
 *   • אימיילים — RFC-light regex
 *   • מספרי כרטיס אשראי — 13-19 ספרות (defensive — לרוב לא מופיע ב-clinical
 *     notes אבל מטפל יכול בטעות לרשום פרטי תשלום בהערות)
 *
 * מחזיר את הטקסט המקורי (כולל formatting) חוץ מהמופעים שהוחלפו ב-placeholders.
 *
 * @example
 *   redactPii("המטופל בקש להתקשר אליו 052-1234567 לפני 0900") →
 *     "המטופל בקש להתקשר אליו [טלפון] לפני 0900"
 */
export function redactPii(text: string | null | undefined): string {
  if (text === null || text === undefined) return "";
  if (typeof text !== "string") return String(text);
  if (text.length === 0) return text;

  let out = text;

  // 1. אימיילים — חייב להיות לפני טלפון/ID כי חלקים שלהם יכולים להתנגש.
  // RFC-light: local@domain.tld — לא תופס edge cases אקזוטיים, מספיק
  // למניעת PII רגיל.
  out = out.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    REDACTION.EMAIL
  );

  // 2. כרטיסי אשראי — 13-19 ספרות עם אופציה למקפים/רווחים בין רביעיות.
  // Visa/Mastercard/Amex כולם נופלים ב-13-19. שמירת ה-boundaries (\b) כדי
  // לא לאכול חלקי תאריכים.
  out = out.replace(
    // eslint-disable-next-line security/detect-unsafe-regex -- each repetition consumes a mandatory \d, linear backtracking
    /\b\d(?:[ -]?\d){12,18}\b/g,
    (match) => {
      // בדוק שיש לפחות 13 ספרות בלי הפרדה (לא רק מקפים).
      const digits = match.replace(/[ -]/g, "");
      return digits.length >= 13 && digits.length <= 19
        ? REDACTION.CARD
        : match;
    }
  );

  // 3. טלפונים ישראליים — נסיון tight לפני loose:
  //    a) +972/972 + 8-9 ספרות (אופציה למקפים/רווחים)
  //    b) 0XX-XXXXXXX (3+7 ספרות עם מקף/רווח/בלי)
  //    c) 0XXXXXXXXX (10 ספרות רצופות שמתחילות ב-0)
  out = out.replace(
    // eslint-disable-next-line security/detect-unsafe-regex -- unrolled loop with max 2 trailing optional digits
    /(?:\+?972|972)[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d(?:[\s-]?\d){0,2}/g,
    REDACTION.PHONE
  );
  out = out.replace(
    /\b0\d{1,2}[\s-]?\d{3}[\s-]?\d{4}\b/g,
    REDACTION.PHONE
  );
  out = out.replace(/\b0\d{8,9}\b/g, REDACTION.PHONE);

  // 4. ת"ז ישראלית — 9 ספרות רצופות. \b boundaries מונעים תיעול לתוך
  // מספרים ארוכים יותר (כרטיס אשראי כבר עברנו). אופציה למקף בודד אחרי 3
  // ספרות (פורמט נפוץ XXX-XXXXXX).
  out = out.replace(/\b\d{3}-\d{6}\b/g, REDACTION.ID);
  out = out.replace(/\b\d{9}\b/g, REDACTION.ID);

  return out;
}

/**
 * Helper convenience — מחיל redactPii על מספר שדות בו-זמנית. שימושי לבנייה
 * של prompt עם כמה blobs של טקסט חופשי. מחזיר אובייקט עם אותם keys ועם
 * הערכים redacted.
 *
 * @example
 *   const safe = redactPiiFields({
 *     note: client.notes,
 *     context: client.culturalContext,
 *   });
 *   buildPrompt(safe.note, safe.context);
 */
export function redactPiiFields<T extends Record<string, string | null | undefined>>(
  fields: T
): { [K in keyof T]: string } {
  const out = {} as { [K in keyof T]: string };
  for (const key in fields) {
    out[key] = redactPii(fields[key]);
  }
  return out;
}
