import crypto from 'crypto';

const getSecret = () => {
  // M4 — סוד ייחודי לחתימת קישורי קבלה ציבוריים (לא לערבב עם NEXTAUTH_SECRET).
  // השארנו fallback ל-ENCRYPTION_KEY/NEXTAUTH_SECRET כדי שמערכות קיימות לא יישברו
  // לפני ש-RECEIPT_TOKEN_SECRET יוגדר ב-Render. ברגע שהוא מוגדר, הוא יקדים.
  const key =
    process.env.RECEIPT_TOKEN_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET;
  if (!key) {
    throw new Error('חסר מפתח חתימה — יש להגדיר RECEIPT_TOKEN_SECRET');
  }
  return key;
};

// M4 (2026-05-17): שודרג מ-24 hex chars (96 bits) ל-32 (128 bits). PHI כמו
// קבלות רפואיות מצריך 128-bit לפחות.
// M10.8: ה-legacy v=0 (96-bit) הוסר — אין משתמשים פעילים בייצור. כל ה-payments
// מקבלים v=1 ויאומתו רק כ-128-bit.
const TOKEN_LENGTH_HEX = 32; // 128 bits

function computeHmac(paymentId: string): string {
  return crypto
    .createHmac('sha256', getSecret())
    .update(paymentId)
    .digest('hex');
}

/**
 * generateReceiptToken — מייצר token של 128 ביט (32 hex chars).
 * @param paymentId - מזהה התשלום.
 */
export function generateReceiptToken(paymentId: string): string {
  return computeHmac(paymentId).slice(0, TOKEN_LENGTH_HEX);
}

/**
 * verifyReceiptToken — בודק token מול ה-paymentId.
 * @param paymentId - מזהה התשלום.
 * @param token - ה-token שהמשתמש שלח (plain hex, 32 chars).
 */
export function verifyReceiptToken(paymentId: string, token: string): boolean {
  if (typeof token !== 'string') return false;
  if (token.length !== TOKEN_LENGTH_HEX) return false;

  const expected = computeHmac(paymentId).slice(0, TOKEN_LENGTH_HEX);
  // timingSafeEqual דורש אורכים זהים — וידאנו זאת לעיל.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(token, 'utf8')
    );
  } catch {
    return false;
  }
}

/**
 * getReceiptPageUrl — בונה URL ציבורי עם token (128-bit).
 *
 * M9.2: ה-token עובר ב-URL fragment (#t=) במקום querystring כדי שלא ידלוף
 * ב-Referer header. דף הקבלה (/receipt/[id]/page.tsx) טוען html2canvas+jspdf
 * דינמית — Referer של ה-CDN/script-src היה חושף את ה-token. fragments אינם
 * נשלחים בבקשות HTTP.
 */
export function getReceiptPageUrl(paymentId: string): string {
  const token = generateReceiptToken(paymentId);
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return `${baseUrl}/receipt/${paymentId}#t=${token}`;
}
