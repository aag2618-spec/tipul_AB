// H17: Signed URLs להקלטות.
//
// בעיה לפני: ה-audioUrl ב-DB הוא מסלול קבוע ל-/api/uploads/recordings/...
// וכל מי שמשיג את ה-URL + cookie תקף יכול להאזין. אם cookie דולף, או
// URL דולף ב-logs/browser history/screen-share — גישה בלתי-מוגבלת בזמן.
//
// פתרון: יצירת URL חתום עם תוקף קצר (15 דקות).
// ה-URL כולל:
//   • recordingId — איזו הקלטה
//   • userId — מי קיבל את ה-token (binding לא רק לקובץ, גם לזהות)
//   • expiresAt — Unix timestamp (seconds)
//   • signature — HMAC-SHA256 על שלושת השדות
//
// הסכימה מבטיחה:
//   1. גם אם URL דולף — לא תקף אחרי 15 דקות.
//   2. מי שמחזיק את ה-URL יכול להאזין רק אם הוא מצויד גם ב-cookie של userId שצוין
//      (defence-in-depth — לא הכרחי לחתימה אבל מאפשר לוגינג).
//   3. שינוי של כל אחד מהשדות פוסל את החתימה.

import crypto from "crypto";

const RECORDING_URL_TTL_SECONDS = 15 * 60; // 15 דקות

function getSecret(): string {
  // H17 secret — fallback ל-ENCRYPTION_KEY/NEXTAUTH_SECRET כדי שמערכות קיימות
  // לא יישברו לפני שRECORDING_URL_SECRET יוגדר. ברגע שהוגדר, הוא הקודם.
  const key =
    process.env.RECORDING_URL_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET;
  if (!key) {
    throw new Error("חסר מפתח חתימה — יש להגדיר RECORDING_URL_SECRET");
  }
  return key;
}

function buildSignaturePayload(
  recordingId: string,
  userId: string,
  expiresAt: number,
): string {
  // delimiter שלא יכול להופיע ב-CUID/timestamp — מבטיח שלא ניתן להזיז גבולות
  return `r=${recordingId}|u=${userId}|e=${expiresAt}`;
}

function computeSignature(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export interface SignedRecordingUrl {
  url: string;
  expiresAt: number;
}

/**
 * יוצר URL חתום להגשת הקלטה.
 * @param recordingId - מזהה ההקלטה ב-DB
 * @param userId - מזהה המשתמש שמקבל את ה-URL (binding לזהות)
 * @returns URL מלא (יחסי — `/api/recordings/[id]/audio?...`) + expiresAt
 */
export function signRecordingUrl(
  recordingId: string,
  userId: string,
): SignedRecordingUrl {
  const expiresAt = Math.floor(Date.now() / 1000) + RECORDING_URL_TTL_SECONDS;
  const payload = buildSignaturePayload(recordingId, userId, expiresAt);
  const sig = computeSignature(payload);
  // u/e/s = user/expiry/signature. URL-safe (חוץ מ-userId שעלול להכיל chars
  // לא ידידותיים — מקודד עם encodeURIComponent).
  const url = `/api/recordings/${encodeURIComponent(
    recordingId,
  )}/audio?u=${encodeURIComponent(userId)}&e=${expiresAt}&s=${sig}`;
  return { url, expiresAt };
}

export type VerifySignatureResult =
  | { valid: true; userId: string; recordingId: string }
  | { valid: false; reason: "EXPIRED" | "INVALID_SIGNATURE" | "MALFORMED" };

/**
 * בודק חתימה של URL חתום.
 * חוזר עם הסיבה לכישלון כדי שה-handler יוכל לרשום ב-audit
 * (אבל לא חושף לעולם הסיבה — מבחוץ זה רק 401/403).
 */
export function verifyRecordingSignature(params: {
  recordingId: string;
  userId: string;
  expiresAt: number;
  signature: string;
}): VerifySignatureResult {
  const { recordingId, userId, expiresAt, signature } = params;

  if (!recordingId || !userId || !expiresAt || !signature) {
    return { valid: false, reason: "MALFORMED" };
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return { valid: false, reason: "MALFORMED" };
  }
  if (!/^[a-f0-9]{64}$/.test(signature)) {
    return { valid: false, reason: "MALFORMED" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > expiresAt) {
    return { valid: false, reason: "EXPIRED" };
  }

  const payload = buildSignaturePayload(recordingId, userId, expiresAt);
  const expected = computeSignature(payload);

  // timing-safe compare
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) {
    return { valid: false, reason: "INVALID_SIGNATURE" };
  }
  if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, reason: "INVALID_SIGNATURE" };
  }

  return { valid: true, userId, recordingId };
}

export const RECORDING_URL_TTL = RECORDING_URL_TTL_SECONDS;
