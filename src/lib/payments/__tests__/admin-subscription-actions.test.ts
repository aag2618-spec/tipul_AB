// ============================================================================
// Tests: Admin Subscription Actions (Stage 6 — תיעוד אדמין מורחב)
// ============================================================================
// TDD לפי feedback_critical_changes_process — שינוי קריטי (כסף!) חייב טסטים
// לפני impl. כיסוי:
//   1. validateExtendTrial — הארכת ניסיון (days, max)
//   2. validateGrantPackage — מתן חבילה חינם
//   3. validateChangeTier — שינוי tier ידני
//   4. validateOverridePrice — דריסת מחיר מנוי
//   5. validateSetFree / Unset — מנוי חינם
//   6. validateRefundPayment — זיכוי תשלום
//   7. calculateNewTrialEndsAt — מתי מסתיים ניסיון אחרי הארכה
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  validateExtendTrial,
  validateGrantPackage,
  validateChangeTier,
  validateOverridePrice,
  validateSetFree,
  validateRefundPayment,
  calculateNewTrialEndsAt,
  MAX_TRIAL_EXTENSION_DAYS,
} from "@/lib/payments/admin-subscription-actions";

const day = (iso: string) => new Date(iso);

// ============================================================================
// validateExtendTrial — הארכת ניסיון
// ============================================================================

describe("validateExtendTrial", () => {
  it("days=14 — מותר", () => {
    const r = validateExtendTrial({ days: 14 });
    expect(r.allowed).toBe(true);
  });

  it("days=0 — אסור (חסר ערך)", () => {
    const r = validateExtendTrial({ days: 0 });
    expect(r.allowed).toBe(false);
  });

  it("days שלילי — אסור (defense in depth)", () => {
    const r = validateExtendTrial({ days: -5 });
    expect(r.allowed).toBe(false);
  });

  it("days > MAX_TRIAL_EXTENSION_DAYS — אסור", () => {
    const r = validateExtendTrial({ days: MAX_TRIAL_EXTENSION_DAYS + 1 });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("מקסימום");
  });

  it("days = MAX_TRIAL_EXTENSION_DAYS — מותר (boundary)", () => {
    const r = validateExtendTrial({ days: MAX_TRIAL_EXTENSION_DAYS });
    expect(r.allowed).toBe(true);
  });

  it("days עשרוני — אסור (חייב integer)", () => {
    const r = validateExtendTrial({ days: 7.5 });
    expect(r.allowed).toBe(false);
  });
});

// ============================================================================
// calculateNewTrialEndsAt — חישוב תאריך חדש
// ============================================================================

describe("calculateNewTrialEndsAt", () => {
  it("ניסיון קיים שעוד פעיל — מוסיף ימים מ-currentTrialEndsAt", () => {
    const current = day("2026-06-30T00:00:00Z");
    const now = day("2026-06-15T00:00:00Z");
    const r = calculateNewTrialEndsAt({
      currentTrialEndsAt: current,
      daysToAdd: 14,
      now,
    });
    expect(r.toISOString()).toBe("2026-07-14T00:00:00.000Z");
  });

  it("ניסיון שפג — מוסיף ימים מ-now", () => {
    const current = day("2026-06-01T00:00:00Z"); // עבר
    const now = day("2026-06-15T00:00:00Z");
    const r = calculateNewTrialEndsAt({
      currentTrialEndsAt: current,
      daysToAdd: 14,
      now,
    });
    expect(r.toISOString()).toBe("2026-06-29T00:00:00.000Z");
  });

  it("currentTrialEndsAt=null — מוסיף ימים מ-now", () => {
    const now = day("2026-06-15T00:00:00Z");
    const r = calculateNewTrialEndsAt({
      currentTrialEndsAt: null,
      daysToAdd: 7,
      now,
    });
    expect(r.toISOString()).toBe("2026-06-22T00:00:00.000Z");
  });
});

// ============================================================================
// validateGrantPackage — מתן חבילה חינם
// ============================================================================

describe("validateGrantPackage", () => {
  it("חבילה תקפה (SMS + 100 credits) — מותר", () => {
    const r = validateGrantPackage({
      packageType: "SMS",
      credits: 100,
    });
    expect(r.allowed).toBe(true);
  });

  it("credits=0 — אסור", () => {
    const r = validateGrantPackage({
      packageType: "SMS",
      credits: 0,
    });
    expect(r.allowed).toBe(false);
  });

  it("credits שלילי — אסור", () => {
    const r = validateGrantPackage({
      packageType: "AI_DETAILED_ANALYSIS",
      credits: -10,
    });
    expect(r.allowed).toBe(false);
  });

  it("credits עשרוני — אסור", () => {
    const r = validateGrantPackage({
      packageType: "SMS",
      credits: 10.5,
    });
    expect(r.allowed).toBe(false);
  });

  it("AI_DETAILED_ANALYSIS עם credits גדול — מותר", () => {
    const r = validateGrantPackage({
      packageType: "AI_DETAILED_ANALYSIS",
      credits: 1000,
    });
    expect(r.allowed).toBe(true);
  });
});

// ============================================================================
// validateChangeTier — שינוי tier ידני
// ============================================================================

describe("validateChangeTier", () => {
  it("מעבר PRO→ENTERPRISE — מותר", () => {
    const r = validateChangeTier({
      fromTier: "PRO",
      toTier: "ENTERPRISE",
    });
    expect(r.allowed).toBe(true);
  });

  it("מעבר ESSENTIAL→PRO — מותר", () => {
    const r = validateChangeTier({
      fromTier: "ESSENTIAL",
      toTier: "PRO",
    });
    expect(r.allowed).toBe(true);
  });

  it("downgrade ENTERPRISE→ESSENTIAL — מותר (אדמין יכול)", () => {
    const r = validateChangeTier({
      fromTier: "ENTERPRISE",
      toTier: "ESSENTIAL",
    });
    expect(r.allowed).toBe(true);
  });

  it("אותו tier — אסור (no-op)", () => {
    const r = validateChangeTier({
      fromTier: "PRO",
      toTier: "PRO",
    });
    expect(r.allowed).toBe(false);
  });

  it("tier לא חוקי — אסור", () => {
    const r = validateChangeTier({
      fromTier: "PRO",
      toTier: "INVALID" as never,
    });
    expect(r.allowed).toBe(false);
  });
});

// ============================================================================
// validateOverridePrice — דריסת מחיר מנוי
// ============================================================================

describe("validateOverridePrice", () => {
  it("מחיר 100₪ — מותר", () => {
    const r = validateOverridePrice({ amountIls: 100 });
    expect(r.allowed).toBe(true);
  });

  it("מחיר 0₪ — אסור (להגדיר חינם יש פעולה נפרדת)", () => {
    const r = validateOverridePrice({ amountIls: 0 });
    expect(r.allowed).toBe(false);
  });

  it("מחיר שלילי — אסור", () => {
    const r = validateOverridePrice({ amountIls: -50 });
    expect(r.allowed).toBe(false);
  });

  it("מחיר עצום — אסור (defense in depth)", () => {
    const r = validateOverridePrice({ amountIls: 1_000_000 });
    expect(r.allowed).toBe(false);
  });

  it("NaN — אסור", () => {
    const r = validateOverridePrice({ amountIls: NaN });
    expect(r.allowed).toBe(false);
  });
});

// ============================================================================
// validateSetFree — מנוי חינם
// ============================================================================

describe("validateSetFree", () => {
  it("isFree=true עם note — מותר", () => {
    const r = validateSetFree({ isFree: true, note: "מטפל אורח מ-2026" });
    expect(r.allowed).toBe(true);
  });

  it("isFree=true בלי note — אסור (תיעוד חובה)", () => {
    const r = validateSetFree({ isFree: true, note: "" });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("הערה");
  });

  it("isFree=false — מותר בלי note", () => {
    const r = validateSetFree({ isFree: false, note: null });
    expect(r.allowed).toBe(true);
  });
});

// ============================================================================
// validateRefundPayment — זיכוי תשלום
// ============================================================================

describe("validateRefundPayment", () => {
  it("זיכוי מלא — מותר", () => {
    const r = validateRefundPayment({
      originalAmount: 145,
      refundAmount: 145,
      alreadyRefunded: 0,
      reason: "טעות חיוב",
    });
    expect(r.allowed).toBe(true);
  });

  it("זיכוי חלקי — מותר", () => {
    const r = validateRefundPayment({
      originalAmount: 145,
      refundAmount: 50,
      alreadyRefunded: 0,
      reason: "הנחה אדמין",
    });
    expect(r.allowed).toBe(true);
  });

  it("זיכוי גבוה יותר מהמקורי — אסור", () => {
    const r = validateRefundPayment({
      originalAmount: 145,
      refundAmount: 200,
      alreadyRefunded: 0,
      reason: "טעות",
    });
    expect(r.allowed).toBe(false);
  });

  it("זיכוי חלקי שגורם לסה״כ גבוה מ-originalAmount — אסור", () => {
    const r = validateRefundPayment({
      originalAmount: 145,
      refundAmount: 100,
      alreadyRefunded: 100, // כבר הוחזר 100, רוצה עוד 100 = 200 > 145
      reason: "טעות שנייה",
    });
    expect(r.allowed).toBe(false);
  });

  it("זיכוי בלי סיבה — אסור", () => {
    const r = validateRefundPayment({
      originalAmount: 145,
      refundAmount: 145,
      alreadyRefunded: 0,
      reason: "",
    });
    expect(r.allowed).toBe(false);
  });

  it("זיכוי שלילי — אסור", () => {
    const r = validateRefundPayment({
      originalAmount: 145,
      refundAmount: -50,
      alreadyRefunded: 0,
      reason: "ניסיון",
    });
    expect(r.allowed).toBe(false);
  });

  it("זיכוי 0 — אסור", () => {
    const r = validateRefundPayment({
      originalAmount: 145,
      refundAmount: 0,
      alreadyRefunded: 0,
      reason: "ניסיון",
    });
    expect(r.allowed).toBe(false);
  });
});
