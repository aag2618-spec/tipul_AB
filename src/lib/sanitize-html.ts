// H4 — Server-side HTML sanitization של תוכן עשיר מ-TipTap rich-text-editor.
//
// הבעיה: TipTap מחזיר HTML שהמשתמש כתב. אם נשמור אותו ל-DB ונציג אותו ללא
// ניקוי, תוקף יכול להזריק <img onerror>, <script>, או onclick handlers
// ולעקוף את ה-CSP (גם CSP הנוכחי ב-Report-Only).
//
// הפתרון: isomorphic-dompurify מנקה את ה-HTML בצד השרת לפני שמירה. אנחנו
// משאירים tags שה-editor יוצר (paragraphs, lists, formatting), ומסירים
// scripts/handlers/javascript: URLs.

import DOMPurify from "isomorphic-dompurify";

// allowlist מינימלי לתוכן עשיר רגיל (TipTap default extensions).
// אם תוסיפו extensions (טבלאות, קוד, וכו') — הוסיפו tags כאן.
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "code", "pre",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "hr",
  "a",
  "span", "div",
];

const ALLOWED_ATTR = [
  "href", "target", "rel", // ל-<a>
  "class", // formatting classes (TipTap מסמן רשימות וכו')
  "dir", // RTL/LTR
];

const FORBID_ATTR = [
  // event handlers
  "onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur",
  "onchange", "onsubmit", "onkeydown", "onkeyup", "onkeypress",
  "onmousedown", "onmouseup", "onmousemove", "onmouseenter", "onmouseleave",
  // attributes שמאפשרים JS execution
  "formaction", "action",
];

/**
 * מנקה HTML שמגיע מהמשתמש לפני שמירה ב-DB או שליחה ל-LLM.
 * מחזיר string ריק אם הקלט null/undefined.
 *
 * שימוש:
 *   const safe = sanitizeUserHtml(body.content);
 *   await prisma.sessionNote.update({ data: { content: safe } });
 */
export function sanitizeUserHtml(input: unknown): string {
  if (typeof input !== "string") return "";
  if (input.length === 0) return "";

  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_ATTR,
    ALLOW_DATA_ATTR: false, // לא ניתן data-*
    KEEP_CONTENT: true, // שמור text של tags שהוסרו
    USE_PROFILES: { html: true }, // לא SVG, לא MathML (וקטור XSS)
  });
}

/**
 * M3 (2026-05-17): מסיר כל HTML מטקסט שחוזר מ-LLM (Gemini). תגובות AI
 * אמורות להיות JSON עם strings, אבל אם המודל הוזה <img onerror> או
 * <script>, נחזיר תוצאה שיכולה להתפרש כ-HTML אצל הצרכן (DB → render).
 *
 * בניגוד ל-sanitizeUserHtml שמשאיר tags לתצוגה, הפונקציה הזו מוחקת
 * הכל. AI לא אמור להחזיר HTML, ואם הוא עושה — סימן לבעיה.
 */
export function sanitizeAiText(input: unknown): string {
  if (typeof input !== "string") return "";
  if (input.length === 0) return "";
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}

/**
 * עובר רקורסיבית על אובייקט/מערך ומנקה כל string דרך sanitizeAiText.
 * שימושי לתוצאות AI מובנות (NoteAnalysis, SessionAnalysis וכו').
 *
 * MAX_DEPTH מונע stack overflow על JSON שגוי (Gemini hallucination ל-self-
 * reference). אם נחצה — נחזיר ה-value כפי שהוא, או null למקרים מקוננים.
 */
const SANITIZE_MAX_DEPTH = 8;

export function stripHtmlTags(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], KEEP_CONTENT: true });
}

export function sanitizeAiResponse<T>(value: T, depth = 0): T {
  if (depth > SANITIZE_MAX_DEPTH) return value;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeAiText(value) as unknown as T;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeAiResponse(v, depth + 1)) as unknown as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeAiResponse(v, depth + 1);
    }
    return out as unknown as T;
  }
  return value;
}
