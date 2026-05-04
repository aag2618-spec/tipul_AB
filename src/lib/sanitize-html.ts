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
