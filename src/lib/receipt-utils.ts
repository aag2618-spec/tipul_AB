// src/lib/receipt-utils.ts
// Helpers משותפים לזרימת הקבלות אחרי תשלום (מזומן/העברה/צ'ק/אשראי).
// משמש את ReceiptPreviewDialog, את דפי ה-mark-paid/complete-session/quick-mark-paid
// ואת /p/thanks. אחידות = פחות באגים.

/**
 * Defense-in-depth — מאמת ש-URL הוא http/https בלבד לפני window.open.
 * חיוני כי receiptUrl מגיע מ-DB; אם נפרץ webhook/ספק חיצוני, javascript:
 * או data:URL היו רצים בקונטקסט המשתמש המחובר. relative paths נטמעים
 * ב-window.location.origin ולכן בטוחים.
 */
export function safeHttpUrl(input: string | null | undefined): string | null {
  if (!input || typeof input !== "string") return null;
  if (input.length > 2000) return null;
  try {
    if (typeof window === "undefined") return null;
    const u = new URL(input, window.location.origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * זיהוי קבלה פנימית בפורמט `/receipt/{id}#t=<32hex>` והוצאת ה-id+token.
 * מחזיר null עבור Cardcom URL או URL חיצוני אחר.
 */
export function parseInternalReceipt(
  url: string | null,
): { id: string; token: string } | null {
  if (!url) return null;
  try {
    if (typeof window === "undefined") return null;
    const u = new URL(url, window.location.origin);
    const match = u.pathname.match(/\/receipt\/([^/]+)/);
    if (!match) return null;
    if (!u.hash.startsWith("#t=")) return null;
    const token = decodeURIComponent(u.hash.substring("#t=".length));
    if (!token || token.length !== 32) return null;
    return { id: match[1], token };
  } catch {
    return null;
  }
}

/**
 * Tries to open a receipt URL in a new tab using the current user-gesture
 * context. Returns whether the popup actually opened (false → blocked or
 * URL invalid → caller should fall back to in-page dialog).
 *
 * Always validates with safeHttpUrl first to avoid javascript:/data: URLs.
 */
export function tryOpenReceiptInNewTab(
  receiptUrl: string | null | undefined,
): { opened: boolean; safeUrl: string | null } {
  const safe = safeHttpUrl(receiptUrl);
  if (!safe) return { opened: false, safeUrl: null };
  try {
    const w = window.open(safe, "_blank", "noopener,noreferrer");
    const opened = !!w && !w.closed;
    if (opened) {
      try {
        w!.focus();
      } catch {
        // לא קריטי: cross-origin focus יכול להיכשל; הלשונית עדיין נפתחה.
      }
    }
    return { opened, safeUrl: safe };
  } catch {
    return { opened: false, safeUrl: safe };
  }
}
