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
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  INVITATION_TTL_MS,
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
