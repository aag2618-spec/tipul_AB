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

export function generateReceiptToken(paymentId: string): string {
  return crypto
    .createHmac('sha256', getSecret())
    .update(paymentId)
    .digest('hex')
    .slice(0, 24);
}

export function verifyReceiptToken(paymentId: string, token: string): boolean {
  const expected = generateReceiptToken(paymentId);
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(token, 'utf8')
  );
}

export function getReceiptPageUrl(paymentId: string): string {
  const token = generateReceiptToken(paymentId);
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return `${baseUrl}/receipt/${paymentId}?t=${token}`;
}
