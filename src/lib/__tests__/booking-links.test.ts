import { describe, it, expect } from "vitest";
import {
  BOOKING_LINK_TTL_MS,
  OTP_TTL_MS,
  OTP_VERIFIED_WINDOW_MS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_SEND_MAX_PER_WINDOW,
  BOOKING_TOKEN_REGEX,
  computeBookingLinkExpiresAt,
  computeOtpExpiresAt,
  maskPhone,
  evaluateBookingLinkAccess,
  evaluateOtpSend,
  evaluateOtpAttempt,
  applyFailedOtpAttempt,
  isOtpSessionVerified,
} from "@/lib/booking-links";
import { OTP_MAX_ATTEMPTS } from "@/lib/clinic-invitations";

const NOW = new Date("2026-06-01T10:00:00Z");

describe("computeBookingLinkExpiresAt", () => {
  it("מוסיף 60 יום ל-now", () => {
    const exp = computeBookingLinkExpiresAt(NOW);
    expect(exp.getTime()).toBe(NOW.getTime() + BOOKING_LINK_TTL_MS);
    expect(BOOKING_LINK_TTL_MS).toBe(60 * 24 * 60 * 60 * 1000);
  });
});

describe("computeOtpExpiresAt", () => {
  it("מוסיף 10 דקות ל-now", () => {
    expect(computeOtpExpiresAt(NOW).getTime()).toBe(NOW.getTime() + OTP_TTL_MS);
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000);
  });
});

describe("BOOKING_TOKEN_REGEX", () => {
  it("מקבל token תקין של 43 תווי base64url", () => {
    // 32 בייט base64url = 43 תווים
    expect(BOOKING_TOKEN_REGEX.test("a".repeat(43))).toBe(true);
    expect(BOOKING_TOKEN_REGEX.test("Ab9_-Ab9_-Ab9_-Ab9_-Ab9_-Ab9_-Ab9_-Ab9_-Ab9")).toBe(true);
  });
  it("דוחה אורך שגוי או תווים פסולים", () => {
    expect(BOOKING_TOKEN_REGEX.test("short")).toBe(false);
    expect(BOOKING_TOKEN_REGEX.test("a".repeat(44))).toBe(false);
    expect(BOOKING_TOKEN_REGEX.test("a".repeat(42) + "!")).toBe(false);
    expect(BOOKING_TOKEN_REGEX.test("")).toBe(false);
  });
});

describe("maskPhone", () => {
  it("חושף רק 4 ספרות אחרונות", () => {
    expect(maskPhone("0501234567")).toBe("••••••4567");
    expect(maskPhone("050-123-4567")).toBe("••••••4567"); // מתעלם ממקפים
  });
  it("טלפון קצר מאוד — לא חושף ספרות", () => {
    expect(maskPhone("123")).toBe("•••");
    expect(maskPhone("")).toBe("");
  });
});

describe("evaluateBookingLinkAccess", () => {
  const future = new Date(NOW.getTime() + 1000 * 60 * 60);
  const past = new Date(NOW.getTime() - 1000);

  it("ACTIVE עם תוקף עתידי → ok", () => {
    expect(evaluateBookingLinkAccess({ status: "ACTIVE", expiresAt: future }, NOW)).toEqual({ ok: true });
  });
  it("REVOKED → לא ok עם reason revoked", () => {
    const r = evaluateBookingLinkAccess({ status: "REVOKED", expiresAt: future }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("revoked");
  });
  it("BLOCKED → לא ok עם reason blocked", () => {
    const r = evaluateBookingLinkAccess({ status: "BLOCKED", expiresAt: future }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked");
  });
  it("status EXPIRED → לא ok", () => {
    const r = evaluateBookingLinkAccess({ status: "EXPIRED", expiresAt: future }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });
  it("ACTIVE אבל expiresAt עבר → expired (lazy)", () => {
    const r = evaluateBookingLinkAccess({ status: "ACTIVE", expiresAt: past }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });
  it("expiresAt שווה ל-now בדיוק → expired (סוגר חלון)", () => {
    const r = evaluateBookingLinkAccess({ status: "ACTIVE", expiresAt: NOW }, NOW);
    expect(r.ok).toBe(false);
  });
});

describe("evaluateOtpSend", () => {
  it("ללא שליחה קודמת → מותר, חלון חדש, ספירה 1", () => {
    const d = evaluateOtpSend({ lastOtpSentAt: null, otpSendCount: 0, otpSendWindowAt: null }, NOW);
    expect(d.allowed).toBe(true);
    if (d.allowed) {
      expect(d.otpSendCount).toBe(1);
      expect(d.otpSendWindowAt).toEqual(NOW);
    }
  });

  it("בתוך cooldown של דקה → נחסם", () => {
    const lastSent = new Date(NOW.getTime() - (OTP_RESEND_COOLDOWN_MS - 1000));
    const d = evaluateOtpSend({ lastOtpSentAt: lastSent, otpSendCount: 1, otpSendWindowAt: lastSent }, NOW);
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe("cooldown");
  });

  it("אחרי cooldown ובתוך החלון → מגדיל ספירה", () => {
    const windowStart = new Date(NOW.getTime() - 60 * 60 * 1000); // לפני שעה
    const lastSent = new Date(NOW.getTime() - 2 * 60 * 1000); // לפני 2 דקות
    const d = evaluateOtpSend({ lastOtpSentAt: lastSent, otpSendCount: 3, otpSendWindowAt: windowStart }, NOW);
    expect(d.allowed).toBe(true);
    if (d.allowed) {
      expect(d.otpSendCount).toBe(4);
      expect(d.otpSendWindowAt).toEqual(windowStart);
    }
  });

  it("הגיע ל-cap בחלון → נחסם daily_cap", () => {
    const windowStart = new Date(NOW.getTime() - 60 * 60 * 1000);
    const lastSent = new Date(NOW.getTime() - 2 * 60 * 1000);
    const d = evaluateOtpSend(
      { lastOtpSentAt: lastSent, otpSendCount: OTP_SEND_MAX_PER_WINDOW, otpSendWindowAt: windowStart },
      NOW
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe("daily_cap");
  });

  it("חלון 24ש פג → מתאפס לחלון חדש עם ספירה 1", () => {
    const oldWindow = new Date(NOW.getTime() - 25 * 60 * 60 * 1000); // לפני 25 שעות
    const lastSent = new Date(NOW.getTime() - 25 * 60 * 60 * 1000);
    const d = evaluateOtpSend(
      { lastOtpSentAt: lastSent, otpSendCount: OTP_SEND_MAX_PER_WINDOW, otpSendWindowAt: oldWindow },
      NOW
    );
    expect(d.allowed).toBe(true);
    if (d.allowed) {
      expect(d.otpSendCount).toBe(1);
      expect(d.otpSendWindowAt).toEqual(NOW);
    }
  });
});

describe("evaluateOtpAttempt", () => {
  const validOtp = { otpHash: "hash", otpExpiresAt: new Date(NOW.getTime() + 60000), otpAttempts: 0, status: "ACTIVE" as const };

  it("קוד תקין שלא פג → canAttempt", () => {
    expect(evaluateOtpAttempt(validOtp, NOW)).toEqual({ canAttempt: true });
  });
  it("status BLOCKED → locked", () => {
    const r = evaluateOtpAttempt({ ...validOtp, status: "BLOCKED" }, NOW);
    expect(r.canAttempt).toBe(false);
    if (!r.canAttempt) expect(r.reason).toBe("locked");
  });
  it("otpAttempts הגיע למקסימום → locked", () => {
    const r = evaluateOtpAttempt({ ...validOtp, otpAttempts: OTP_MAX_ATTEMPTS }, NOW);
    expect(r.canAttempt).toBe(false);
    if (!r.canAttempt) expect(r.reason).toBe("locked");
  });
  it("אין otpHash → no_otp", () => {
    const r = evaluateOtpAttempt({ ...validOtp, otpHash: null }, NOW);
    expect(r.canAttempt).toBe(false);
    if (!r.canAttempt) expect(r.reason).toBe("no_otp");
  });
  it("קוד פג תוקף → otp_expired", () => {
    const r = evaluateOtpAttempt({ ...validOtp, otpExpiresAt: new Date(NOW.getTime() - 1) }, NOW);
    expect(r.canAttempt).toBe(false);
    if (!r.canAttempt) expect(r.reason).toBe("otp_expired");
  });
});

describe("applyFailedOtpAttempt", () => {
  it("מגדיל מונה; לא נועל לפני המקסימום", () => {
    const r = applyFailedOtpAttempt(0);
    expect(r.otpAttempts).toBe(1);
    expect(r.nowBlocked).toBe(false);
  });
  it("בכשל שמגיע למקסימום → nowBlocked", () => {
    const r = applyFailedOtpAttempt(OTP_MAX_ATTEMPTS - 1);
    expect(r.otpAttempts).toBe(OTP_MAX_ATTEMPTS);
    expect(r.nowBlocked).toBe(true);
  });
});

describe("isOtpSessionVerified", () => {
  it("אומת ממש עכשיו → true", () => {
    expect(isOtpSessionVerified({ otpVerifiedAt: NOW }, NOW)).toBe(true);
  });
  it("אומת לפני פחות מ-30 דקות → true", () => {
    const v = new Date(NOW.getTime() - (OTP_VERIFIED_WINDOW_MS - 1000));
    expect(isOtpSessionVerified({ otpVerifiedAt: v }, NOW)).toBe(true);
  });
  it("אומת לפני יותר מ-30 דקות → false", () => {
    const v = new Date(NOW.getTime() - (OTP_VERIFIED_WINDOW_MS + 1000));
    expect(isOtpSessionVerified({ otpVerifiedAt: v }, NOW)).toBe(false);
  });
  it("מעולם לא אומת → false", () => {
    expect(isOtpSessionVerified({ otpVerifiedAt: null }, NOW)).toBe(false);
  });
});
