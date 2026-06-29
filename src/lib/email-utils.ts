/**
 * Escape user-controlled strings before interpolation into HTML email templates.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * M-XSS-1 defense-in-depth: ולידציית URL ב-render time לפני הזרקה ל-href/src במייל.
 * חוסם scheme לא בטוח (javascript:/data:/file:) שעלול להגיע מ-DB/webhook/הגדרות
 * (גם אם ה-PUT עושה validation, רשומות ישנות עלולות להכיל scheme זדוני).
 * מחזיר את ה-URL המנורמל אם הוא http/https תקין, אחרת null (הקורא מסתיר את האלמנט).
 * שים לב: התוצאה עדיין צריכה לעבור escapeHtml לפני הזרקה ל-attribute.
 */
export function safeHttpUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  if (input.length > 2000) return null;
  try {
    const u = new URL(input);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * מנקה מחרוזת המיועדת לשורת הנושא של מייל (plaintext header).
 * מסיר תווי שורה/טאב כדי למנוע Email Header Injection — תוקף שיכניס
 * "\r\nBcc: ..." בשם המטפל/לקוח עלול להזריק כותרות מייל. שורת נושא היא plaintext,
 * לכן escapeHtml אינו מתאים כאן — צריך להסיר newlines.
 *
 * מטפל גם בתווי קו-מפריד נדירים מעבר ל-\r\n\t: \v \f (אנכי/דף), NEL (U+0085),
 * ו-Unicode line/paragraph separator (U+2028/U+2029) — הגנה-לעומק עקבית, שכן
 * שורת נושא חוקית היא חד-שורתית ותווים אלה לא לגיטימיים בה.
 */
export function sanitizeEmailSubject(str: string): string {
  return str.replace(/[\r\n\t\v\f\u0085\u2028\u2029]+/g, " ").trim();
}

/**
 * שורת נושא בטוחה למייל: מנקה תווי שורה/טאב (מניעת Email Header Injection) ואז
 * חותכת לאורך מרבי בצורה בטוחה-יוניקוד — לא חותכת באמצע זוג surrogate (אימוג'י).
 */
export function safeEmailSubject(str: string, maxLen = 200): string {
  return [...sanitizeEmailSubject(str)].slice(0, maxLen).join("");
}

/**
 * Clean incoming email HTML — strip quoted replies, Gmail date headers, direction markers.
 * Used by communications page and correspondence tab.
 */
export function cleanIncomingContent(html: string): string {
  let cleaned = html;

  // Remove Unicode direction markers, zero-width chars, RTL/LTR marks
  cleaned = cleaned.replace(/[\u200F\u200E\u202B\u202C\u202A\u202D\u202E\u200D\u200C\u200B\u2069\u2068\u2067\u2066\uFEFF]/g, "");

  // Remove gmail_quote divs and everything inside them
  cleaned = cleaned.replace(/<div\s+class=["']gmail_quote["'][\s\S]*$/gi, "");

  // Remove blockquote elements (quoted replies)
  cleaned = cleaned.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "");
  cleaned = cleaned.replace(/<blockquote[\s\S]*$/gi, "");

  // Remove Hebrew "בתאריך ... כתב/ה:" quoting header and everything after
  cleaned = cleaned.replace(/\s*בתאריך\s+[^<]{10,}כתב.*:[\s\S]*$/gi, "");
  cleaned = cleaned.replace(/\s*בתאריך\s+\d{1,2}[\s\S]{0,80}כתב[\s\S]*$/gi, "");
  // Also catch "בתאריך ... מאת ..." patterns (with or without "כתב")
  cleaned = cleaned.replace(/\s*בתאריך\s+[^<]{10,}מאת\s+[\s\S]*$/gi, "");

  // Remove English "On ... wrote:" header and everything after
  cleaned = cleaned.replace(/\s*On\s+\w{3,},?\s+\w[\s\S]*?wrote:\s*[\s\S]*$/gi, "");

  // Remove email addresses in angle brackets like &lt;user@gmail.com&gt; or <user@gmail.com>
  cleaned = cleaned.replace(/&lt;[^@\s]+@[^&\s]+&gt;/gi, "");
  cleaned = cleaned.replace(/<[^@\s>]+@[^>\s]+>/g, "");

  // Remove "---------- Forwarded/Original message" blocks
  cleaned = cleaned.replace(/\s*-{3,}\s*(Forwarded|Original|הודעה)[\s\S]*/gi, "");

  // Remove trailing <br>, empty divs, whitespace
  // eslint-disable-next-line security/detect-unsafe-regex -- alternation anchored by leading <, no ambiguity
  cleaned = cleaned.replace(/(?:<br\s*\/?>|<div>\s*<\/div>)+$/gi, "").trimEnd();

  // If nothing meaningful left, return original content
  const textOnly = cleaned.replace(/<[^>]*>/g, "").trim();
  if (!textOnly || textOnly.length === 0) {
    return html;
  }

  return cleaned;
}

/**
 * Map internal payment method names to billing provider format.
 */
export function mapPaymentMethod(method: string): 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'other' {
  const mapping: Record<string, 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'other'> = {
    CASH: 'cash',
    CHECK: 'check',
    BANK_TRANSFER: 'bank_transfer',
    CREDIT_CARD: 'credit_card',
    CREDIT: 'other',
    OTHER: 'other',
  };
  return mapping[method] || 'other';
}
