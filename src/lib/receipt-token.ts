import crypto from 'crypto';

const getSecret = () => {
  const key = process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!key) {
    throw new Error('חסר מפתח הצפנה — יש להגדיר ENCRYPTION_KEY או NEXTAUTH_SECRET');
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
