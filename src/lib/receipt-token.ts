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
// קבלות רפואיות מצריך 128-bit לפחות. הפונקציה verifyReceiptToken מקבלת
// גם טוקנים ישנים באורך 24 כדי לא לשבור קישורי קבלות שכבר נשלחו במייל.
const TOKEN_LENGTH_HEX = 32; // 128 bits
const LEGACY_TOKEN_LENGTH_HEX = 24; // 96 bits — תמיכה לאחור

function computeHmac(paymentId: string): string {
  return crypto
    .createHmac('sha256', getSecret())
    .update(paymentId)
    .digest('hex');
}

export function generateReceiptToken(paymentId: string): string {
  return computeHmac(paymentId).slice(0, TOKEN_LENGTH_HEX);
}

export function verifyReceiptToken(paymentId: string, token: string): boolean {
  if (typeof token !== 'string') return false;
  const tokenLen = token.length;
  // קבל אורכי טוקן חוקיים בלבד (חדש או ישן). כל אורך אחר → false ללא comparing.
  if (tokenLen !== TOKEN_LENGTH_HEX && tokenLen !== LEGACY_TOKEN_LENGTH_HEX) {
    return false;
  }
  const full = computeHmac(paymentId);
  const expected = full.slice(0, tokenLen);
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

export function getReceiptPageUrl(paymentId: string): string {
  const token = generateReceiptToken(paymentId);
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return `${baseUrl}/receipt/${paymentId}?t=${token}`;
}
