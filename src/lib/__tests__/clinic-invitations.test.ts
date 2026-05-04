import { describe, it, expect } from "vitest";
import {
  generateOtp,
  hashOtp,
  verifyOtp,
  computeExpiresAt,
  isExpired,
  effectiveStatus,
  isAcceptable,
  maskEmail,
  normalizeE164,
  computeBillingRestore,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  INVITATION_TTL_MS,
  RESTORE_FRESH_TRIAL_DAYS,
  RESTORE_GRACE_DAYS,
} from "@/lib/clinic-invitations";

describe("generateOtp", () => {
  it("returns 6-digit string", () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
    expect(otp).toHaveLength(OTP_LENGTH);
  });

  it("generates different OTPs across calls (statistical)", () => {
    const otps = new Set<string>();
    for (let i = 0; i < 50; i++) {
      otps.add(generateOtp());
    }
    // ספרות 6 → 1M ערכים אפשריים. סיכוי קולקציה ב-50 דגימות זניח.
    expect(otps.size).toBeGreaterThanOrEqual(45);
  });
});

describe("hashOtp / verifyOtp", () => {
  it("hashes and verifies correctly", async () => {
    const otp = "123456";
    const hash = await hashOtp(otp);
    expect(hash).not.toBe(otp);
    expect(await verifyOtp(otp, hash)).toBe(true);
  });

  it("rejects wrong OTP", async () => {
    const hash = await hashOtp("111111");
    expect(await verifyOtp("222222", hash)).toBe(false);
  });

  it("two hashes of same OTP differ (salted)", async () => {
    const a = await hashOtp("000000");
    const b = await hashOtp("000000");
    expect(a).not.toBe(b);
  });
});

describe("computeExpiresAt / isExpired", () => {
  it("returns a date ~48h in the future", () => {
    const before = Date.now();
    const exp = computeExpiresAt();
    const diff = exp.getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(INVITATION_TTL_MS - 100);
    expect(diff).toBeLessThanOrEqual(INVITATION_TTL_MS + 100);
  });

  it("isExpired = true when date is in past", () => {
    const past = new Date(Date.now() - 1000);
    expect(isExpired(past)).toBe(true);
  });

  it("isExpired = false when date is in future", () => {
    const future = new Date(Date.now() + 60_000);
    expect(isExpired(future)).toBe(false);
  });
});

describe("effectiveStatus / isAcceptable", () => {
  it("PENDING + expired → EXPIRED", () => {
    const past = new Date(Date.now() - 1000);
    expect(effectiveStatus("PENDING", past)).toBe("EXPIRED");
    expect(isAcceptable("PENDING", past)).toBe(false);
  });

  it("PENDING + future → PENDING", () => {
    const future = new Date(Date.now() + 60_000);
    expect(effectiveStatus("PENDING", future)).toBe("PENDING");
    expect(isAcceptable("PENDING", future)).toBe(true);
  });

  it("ACCEPTED stays ACCEPTED regardless of expiry", () => {
    const past = new Date(Date.now() - 1000);
    expect(effectiveStatus("ACCEPTED", past)).toBe("ACCEPTED");
    expect(isAcceptable("ACCEPTED", past)).toBe(false);
  });

  it("REVOKED stays REVOKED", () => {
    const future = new Date(Date.now() + 60_000);
    expect(effectiveStatus("REVOKED", future)).toBe("REVOKED");
    expect(isAcceptable("REVOKED", future)).toBe(false);
  });
});

describe("maskEmail", () => {
  it("masks the local part except first char", () => {
    expect(maskEmail("david@gmail.com")).toBe("d***@gmail.com");
  });

  it("handles single-char local", () => {
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
  });

  it("returns input unchanged on malformed email", () => {
    expect(maskEmail("notanemail")).toBe("notanemail");
  });
});

describe("normalizeE164", () => {
  it("converts local Israeli format 05X-XXXXXXX", () => {
    expect(normalizeE164("0501234567")).toBe("+972501234567");
    expect(normalizeE164("050-123-4567")).toBe("+972501234567");
    expect(normalizeE164("050 123 4567")).toBe("+972501234567");
  });

  it("accepts +972 format", () => {
    expect(normalizeE164("+972501234567")).toBe("+972501234567");
  });

  it("accepts 972 (no plus)", () => {
    expect(normalizeE164("972501234567")).toBe("+972501234567");
  });

  it("rejects malformed inputs", () => {
    expect(normalizeE164("abc")).toBeNull();
    expect(normalizeE164("12345")).toBeNull();
    expect(normalizeE164("+44-7700-900000")).toBeNull(); // not Israeli
    expect(normalizeE164("")).toBeNull();
    expect(normalizeE164(null)).toBeNull();
    expect(normalizeE164(undefined)).toBeNull();
  });
});

describe("OTP_MAX_ATTEMPTS constant", () => {
  it("is reasonable (3-10)", () => {
    expect(OTP_MAX_ATTEMPTS).toBeGreaterThanOrEqual(3);
    expect(OTP_MAX_ATTEMPTS).toBeLessThanOrEqual(10);
  });
});

// ─── MyTipul-B: computeBillingRestore ─────────────────────────────────────

describe("computeBillingRestore (MyTipul-B)", () => {
  const NOW = new Date("2026-05-04T12:00:00Z");
  const day = 24 * 60 * 60 * 1000;

  it("wasNeverActive (status=null) → TRIALING + 30 ימים חדשים", () => {
    const plan = computeBillingRestore({
      subscriptionStatusBeforeClinic: null,
      trialEndsAt: null,
      now: NOW,
    });
    expect(plan.newStatus).toBe("TRIALING");
    expect(plan.grantedFreshTrial).toBe(true);
    expect(plan.appliedGrace).toBe(false);
    const expectedTrial = new Date(NOW.getTime() + RESTORE_FRESH_TRIAL_DAYS * day);
    expect(plan.newTrialEndsAt.getTime()).toBe(expectedTrial.getTime());
  });

  it("ACTIVE לפני + trialEndsAt בעתיד → ACTIVE + שמירת trialEndsAt", () => {
    const future = new Date(NOW.getTime() + 60 * day);
    const plan = computeBillingRestore({
      subscriptionStatusBeforeClinic: "ACTIVE",
      trialEndsAt: future,
      now: NOW,
    });
    expect(plan.newStatus).toBe("ACTIVE");
    expect(plan.grantedFreshTrial).toBe(false);
    expect(plan.appliedGrace).toBe(false);
    expect(plan.newTrialEndsAt.getTime()).toBe(future.getTime());
  });

  it("TRIALING לפני + trialEndsAt בעבר → TRIALING + grace 7 ימים", () => {
    const past = new Date(NOW.getTime() - 30 * day);
    const plan = computeBillingRestore({
      subscriptionStatusBeforeClinic: "TRIALING",
      trialEndsAt: past,
      now: NOW,
    });
    expect(plan.newStatus).toBe("TRIALING");
    expect(plan.grantedFreshTrial).toBe(false);
    expect(plan.appliedGrace).toBe(true);
    const expectedGrace = new Date(NOW.getTime() + RESTORE_GRACE_DAYS * day);
    expect(plan.newTrialEndsAt.getTime()).toBe(expectedGrace.getTime());
  });

  it("PAST_DUE לפני + trialEndsAt בעבר → PAST_DUE + grace", () => {
    const past = new Date(NOW.getTime() - 5 * day);
    const plan = computeBillingRestore({
      subscriptionStatusBeforeClinic: "PAST_DUE",
      trialEndsAt: past,
      now: NOW,
    });
    expect(plan.newStatus).toBe("PAST_DUE");
    expect(plan.appliedGrace).toBe(true);
  });

  it("CANCELLED לפני + trialEndsAt בעבר → CANCELLED + grace", () => {
    const past = new Date(NOW.getTime() - 5 * day);
    const plan = computeBillingRestore({
      subscriptionStatusBeforeClinic: "CANCELLED",
      trialEndsAt: past,
      now: NOW,
    });
    expect(plan.newStatus).toBe("CANCELLED");
    expect(plan.appliedGrace).toBe(true);
  });

  it("ACTIVE לפני + trialEndsAt=null → ACTIVE + grace fallback", () => {
    const plan = computeBillingRestore({
      subscriptionStatusBeforeClinic: "ACTIVE",
      trialEndsAt: null,
      now: NOW,
    });
    expect(plan.newStatus).toBe("ACTIVE");
    // טיפול ב-trialEndsAt=null: שומר על המקור (=null במקור) או נותן grace.
    // הקוד נותן grace fallback.
    const expectedGrace = new Date(NOW.getTime() + RESTORE_GRACE_DAYS * day);
    expect(plan.newTrialEndsAt.getTime()).toBe(expectedGrace.getTime());
  });

  it("ברירת מחדל ל-now=Date.now() אם לא מועבר", () => {
    const plan = computeBillingRestore({
      subscriptionStatusBeforeClinic: null,
      trialEndsAt: null,
    });
    // לא חמור — רק לוודא שהפונקציה לא קורסת ושיש trialEndsAt תקף.
    expect(plan.newTrialEndsAt.getTime()).toBeGreaterThan(Date.now());
  });
});
