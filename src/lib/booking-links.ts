/**
 * Personal booking links (BookingLink) — pure, testable helpers.
 *
 * מחליפים את הקישור הכללי (slug) הפתוח לכולם בקישור אישי לכל מטופל:
 *   - token חזק (256 ביט) שמזוהה עם clientId ספציפי.
 *   - אימות OTP — הקוד נשלח רק לפרטי הקשר הרשומים במערכת.
 *   - תוקף 60 יום, רב-פעמי.
 *
 * כל הלוגיקה כאן pure (ללא DB / IO) כדי שתהיה ניתנת לבדיקה ב-unit tests.
 * המסלול (route) רק מחווט אותה ל-Prisma ולשליחת המייל/SMS.
 *
 * דפוס דומה ל-clinic-invitations.ts — שימוש חוזר ב-OTP_MAX_ATTEMPTS, generateOtp,
 * hashOtp, verifyOtp, generateSecureToken, maskEmail משם.
 */

import type { BookingLinkStatus } from "@prisma/client";
import { OTP_MAX_ATTEMPTS } from "./clinic-invitations";

// ─── Constants ───────────────────────────────────────────────────────────────

export const BOOKING_LINK_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 יום
export const OTP_TTL_MS = 10 * 60 * 1000; // הקוד תקף 10 דקות
export const OTP_VERIFIED_WINDOW_MS = 30 * 60 * 1000; // חלון לקביעת תור אחרי אימות — 30 דקות
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // דקה בין בקשות קוד
export const OTP_SEND_WINDOW_MS = 24 * 60 * 60 * 1000; // חלון ספירת שליחות — 24 שעות
export const OTP_SEND_MAX_PER_WINDOW = 8; // מקסימום שליחות קוד ב-24 שעות (cap נגד abuse)

// פורמט token: 32 בייט base64url = 43 תווים בדיוק. רגקס ספציפי עוצר ~99%
// מבקשות probing לפני שאילתת DB.
export const BOOKING_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

// ─── Expiry ──────────────────────────────────────────────────────────────────

export function computeBookingLinkExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + BOOKING_LINK_TTL_MS);
}

export function computeOtpExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + OTP_TTL_MS);
}

// ─── Masking (לתצוגה לפני אימות — לא לחשוף PHI מלא) ──────────────────────────

/**
 * מיסוך טלפון: "0501234567" → "•••••••4567" (4 ספרות אחרונות בלבד).
 * מאפשר למטופל לזהות "זה הטלפון שלי" בלי לחשוף את המספר המלא למחזיק token זר.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "•".repeat(Math.max(0, digits.length));
  return "•".repeat(digits.length - 4) + digits.slice(-4);
}

// ─── Access gate — האם ניתן להשתמש בקישור בכלל ──────────────────────────────

export type LinkAccess =
  | { ok: true }
  | {
      ok: false;
      reason: "expired" | "revoked" | "blocked";
      message: string;
    };

/**
 * הערכת מצב הקישור. EXPIRED נקבע גם לפי status וגם לפי expiresAt בפועל
 * (lazy — ה-DB עשוי עדיין לומר ACTIVE אם הקרון לא רץ).
 */
export function evaluateBookingLinkAccess(
  link: { status: BookingLinkStatus; expiresAt: Date },
  now: Date = new Date()
): LinkAccess {
  if (link.status === "REVOKED") {
    return {
      ok: false,
      reason: "revoked",
      message: "הקישור בוטל. נא לבקש קישור חדש מהמטפל/ת.",
    };
  }
  if (link.status === "BLOCKED") {
    return {
      ok: false,
      reason: "blocked",
      message: "הקישור ננעל עקב יותר מדי ניסיונות. נא לבקש קישור חדש מהמטפל/ת.",
    };
  }
  if (link.status === "EXPIRED" || link.expiresAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      reason: "expired",
      message: "תוקף הקישור פג. נא לבקש קישור חדש מהמטפל/ת.",
    };
  }
  return { ok: true };
}

// ─── שליחת OTP — rate-limit + cap מבוססי-DB (אמינים מול in-memory) ───────────

export type OtpSendDecision =
  | { allowed: true; otpSendCount: number; otpSendWindowAt: Date }
  | {
      allowed: false;
      reason: "cooldown" | "daily_cap";
      message: string;
    };

/**
 * האם מותר לשלוח קוד עכשיו? אוכף:
 *   - cooldown של דקה בין שליחות (מונע הצפה).
 *   - מקסימום OTP_SEND_MAX_PER_WINDOW שליחות בחלון 24 שעות per-token.
 * מחזיר את הערכים החדשים ל-otpSendCount/otpSendWindowAt לכתיבה ב-DB.
 */
export function evaluateOtpSend(
  link: {
    lastOtpSentAt: Date | null;
    otpSendCount: number;
    otpSendWindowAt: Date | null;
  },
  now: Date = new Date()
): OtpSendDecision {
  if (
    link.lastOtpSentAt &&
    now.getTime() - link.lastOtpSentAt.getTime() < OTP_RESEND_COOLDOWN_MS
  ) {
    return {
      allowed: false,
      reason: "cooldown",
      message: "נא להמתין דקה לפני בקשת קוד נוסף.",
    };
  }

  const windowActive =
    !!link.otpSendWindowAt &&
    now.getTime() - link.otpSendWindowAt.getTime() < OTP_SEND_WINDOW_MS;

  if (windowActive) {
    if (link.otpSendCount >= OTP_SEND_MAX_PER_WINDOW) {
      return {
        allowed: false,
        reason: "daily_cap",
        message: "הגעת למספר המרבי של בקשות קוד להיום. נא לנסות שוב מחר.",
      };
    }
    return {
      allowed: true,
      otpSendCount: link.otpSendCount + 1,
      otpSendWindowAt: link.otpSendWindowAt as Date,
    };
  }

  // חלון חדש — מאפסים את הספירה.
  return { allowed: true, otpSendCount: 1, otpSendWindowAt: now };
}

// ─── אימות OTP — gating לפני bcrypt.compare ──────────────────────────────────

export type OtpAttemptState =
  | { canAttempt: true }
  | {
      canAttempt: false;
      reason: "no_otp" | "otp_expired" | "locked";
      message: string;
    };

/**
 * האם מותר לנסות לאמת קוד? נבדק לפני ה-bcrypt.compare:
 *   - status=BLOCKED או otpAttempts הגיע למקסימום → נעול.
 *   - אין otpHash → לא נשלח קוד עדיין.
 *   - הקוד פג תוקף → צריך קוד חדש.
 */
export function evaluateOtpAttempt(
  link: {
    otpHash: string | null;
    otpExpiresAt: Date | null;
    otpAttempts: number;
    status: BookingLinkStatus;
  },
  now: Date = new Date()
): OtpAttemptState {
  if (link.status === "BLOCKED" || link.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return {
      canAttempt: false,
      reason: "locked",
      message: "הקישור ננעל עקב יותר מדי ניסיונות. נא לבקש קישור חדש מהמטפל/ת.",
    };
  }
  if (!link.otpHash) {
    return {
      canAttempt: false,
      reason: "no_otp",
      message: "נא לבקש קוד אימות תחילה.",
    };
  }
  if (!link.otpExpiresAt || link.otpExpiresAt.getTime() <= now.getTime()) {
    return {
      canAttempt: false,
      reason: "otp_expired",
      message: "הקוד פג תוקף. נא לבקש קוד חדש.",
    };
  }
  return { canAttempt: true };
}

/**
 * מצב חדש אחרי ניסיון אימות כושל. אם הגענו ל-OTP_MAX_ATTEMPTS → לנעול (BLOCKED).
 */
export function applyFailedOtpAttempt(attempts: number): {
  otpAttempts: number;
  nowBlocked: boolean;
} {
  const next = attempts + 1;
  return { otpAttempts: next, nowBlocked: next >= OTP_MAX_ATTEMPTS };
}

// ─── חלון מאומת — האם ה-OTP אומת לאחרונה ומותר לקבוע תור ─────────────────────

export function isOtpSessionVerified(
  link: { otpVerifiedAt: Date | null },
  now: Date = new Date()
): boolean {
  return (
    !!link.otpVerifiedAt &&
    now.getTime() - link.otpVerifiedAt.getTime() < OTP_VERIFIED_WINDOW_MS
  );
}
