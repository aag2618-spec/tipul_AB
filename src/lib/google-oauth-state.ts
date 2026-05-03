// src/lib/google-oauth-state.ts
//
// state ל-Google OAuth (Calendar). state הוא הערך שמועבר ל-Google ומגיע
// חזרה ב-callback — מטרתו למנוע CSRF/confused-deputy.
//
// **לפני התיקון:** state = session.user.id (plain) — תוקף שיודע userId היה
// יכול לזייף callback. ה-callback אמנם השווה state לסשן הנוכחי (אז confused-
// deputy מוגן), אבל אין הגנת תוקף-זמן ואין proof שה-state יוצר על ידי השרת.
//
// **התיקון:** state חתום עם HMAC-SHA256 על NEXTAUTH_SECRET וכולל:
//   userId.nonce.expiresMs.signature
// בקליבק: מאמתים את ה-HMAC, בודקים שלא פג תוקף (10 דק'), ושה-userId תואם
// לסשן. כל פיצוח של אחת מאלו → 403.

import crypto from "crypto";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 דקות
const SECRET = () => process.env.NEXTAUTH_SECRET ?? "";

/**
 * יוצר state חתום ל-OAuth flow. תוקף ל-10 דקות מרגע היצירה.
 */
export function createGoogleOAuthState(userId: string): string {
  const secret = SECRET();
  if (!secret) throw new Error("NEXTAUTH_SECRET not configured");
  const nonce = crypto.randomBytes(16).toString("hex");
  const expires = Date.now() + STATE_TTL_MS;
  const payload = `${userId}.${nonce}.${expires}`;
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}.${hmac}`).toString("base64url");
}

export interface VerifiedState {
  valid: boolean;
  userId?: string;
  reason?: "format" | "signature" | "expired" | "no-secret";
}

/**
 * מאמת state. מחזיר { valid, userId } אם הכל תקין, אחרת { valid:false, reason }.
 *
 * שימוש ב-`timingSafeEqual` למניעת timing attack על ההשוואה.
 */
export function verifyGoogleOAuthState(state: string): VerifiedState {
  const secret = SECRET();
  if (!secret) return { valid: false, reason: "no-secret" };

  let decoded: string;
  try {
    decoded = Buffer.from(state, "base64url").toString();
  } catch {
    return { valid: false, reason: "format" };
  }

  const parts = decoded.split(".");
  if (parts.length !== 4) return { valid: false, reason: "format" };
  const [userId, nonce, expiresStr, providedHmac] = parts;
  if (!userId || !nonce || !expiresStr || !providedHmac) {
    return { valid: false, reason: "format" };
  }

  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(`${userId}.${nonce}.${expiresStr}`)
    .digest("hex");
  const providedBuf = Buffer.from(providedHmac, "hex");
  const expectedBuf = Buffer.from(expectedHmac, "hex");
  if (providedBuf.length !== expectedBuf.length) {
    return { valid: false, reason: "signature" };
  }
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false, reason: "signature" };
  }

  const expires = parseInt(expiresStr, 10);
  if (!Number.isFinite(expires) || Date.now() > expires) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, userId };
}
