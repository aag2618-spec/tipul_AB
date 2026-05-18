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
const TOKEN_LENGTH_HEX = 32; // 128 bits — v1
const LEGACY_TOKEN_LENGTH_HEX = 24; // 96 bits — v0 (תאימות לאחור)

// סבב 8 (2026-05-18): sunset לטוקנים legacy. payments שנוצרו לפני 2026-05-17
// (version=0) ימשיכו לעבוד עד התאריך הזה כדי לא לשבור קישורי קבלות שכבר
// נשלחו במייל ללקוחות. אחרי התאריך — verifyReceiptToken יחזיר false גם
// לטוקנים legacy תקפים. צפויה תוצאה: לקוחות עם URLs ישנים מאוד יקבלו 403,
// והם יוכלו לבקש מהמטפל להוציא קבלה חדשה.
const LEGACY_TOKEN_SUNSET_MS = new Date('2026-06-17T00:00:00Z').getTime();

function computeHmac(paymentId: string): string {
  return crypto
    .createHmac('sha256', getSecret())
    .update(paymentId)
    .digest('hex');
}

/**
 * generateReceiptToken — מייצר token לפי גרסה.
 * @param paymentId - מזהה התשלום.
 * @param version - 1 (default, 128-bit) או 0 (legacy 96-bit, רק לשימוש פנימי
 *                  במקרים נדירים של regeneration לpayments ישנים).
 */
export function generateReceiptToken(paymentId: string, version: number = 1): string {
  const hmac = computeHmac(paymentId);
  const len = version === 0 ? LEGACY_TOKEN_LENGTH_HEX : TOKEN_LENGTH_HEX;
  return hmac.slice(0, len);
}

/**
 * verifyReceiptToken — בודק token לפי גרסת ה-Payment.
 * @param paymentId - מזהה התשלום.
 * @param token - ה-token שהמשתמש שלח (plain hex).
 * @param version - 0 או 1. ה-caller חייב לטעון את payment.receiptTokenVersion
 *                  לפני הקריאה — בלי זה, התקיפה של downgrade עוברת.
 */
export function verifyReceiptToken(paymentId: string, token: string, version: number = 1): boolean {
  if (typeof token !== 'string') return false;

  // האורך חייב להתאים בדיוק לגרסת ה-payment — בלי זה, תוקף יכול לשלוח 24
  // chars על payment גרסה 1 ולנסות לפצח את ה-96 ביטים הראשונים של HMAC.
  const expectedLength = version === 0 ? LEGACY_TOKEN_LENGTH_HEX : TOKEN_LENGTH_HEX;
  if (token.length !== expectedLength) return false;

  // Sunset: legacy tokens (v0) נדחים אחרי 30 יום מהדפלוי של סבב 8.
  if (version === 0 && Date.now() > LEGACY_TOKEN_SUNSET_MS) {
    return false;
  }

  const full = computeHmac(paymentId);
  const expected = full.slice(0, expectedLength);
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
 * getReceiptPageUrl — בונה URL ציבורי עם token. payments חדשים תמיד מקבלים v=1.
 * Callers שיוצרים URLs לpayments ישנים (legacy) יכולים להעביר version=0 (נדיר).
 */
export function getReceiptPageUrl(paymentId: string, version: number = 1): string {
  const token = generateReceiptToken(paymentId, version);
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return `${baseUrl}/receipt/${paymentId}?t=${token}`;
}
