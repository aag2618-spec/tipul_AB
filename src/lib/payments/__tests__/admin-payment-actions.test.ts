// ============================================================================
// Tests: Admin Payment Actions (Stage 6 — אדמין מנהל מנוי/חבילות)
// ============================================================================
// TDD לפי feedback_critical_changes_process — כסף + פעולות בלתי הפיכות.
// בדיקות כיסוי:
//   1. validateGrantPackage — האם אדמין יכול להעניק חבילה
//   2. validateRefundPayment — האם ניתן לבצע refund
//   3. calculateRefundableAmount — כמה ניתן להחזיר
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  validateRefundPayment,
  calculateRefundableAmount,
  REFUND_WINDOW_DAYS,
} from "@/lib/payments/admin-payment-actions";

const day = (iso: string) => new Date(iso);

// ============================================================================
// validateRefundPayment — אדמין מבצע refund על SubscriptionPayment
// ============================================================================

describe("validateRefundPayment", () => {
  const baseInput = {
    cardcomTransaction: {
      status: "APPROVED" as const,
      amount: 145,
      refundedAmount: 0,
      completedAt: day("2026-05-01T00:00:00Z"),
      transactionId: "12345",
    },
    refundAmount: 145, // refund מלא
    now: day("2026-05-15T00:00:00Z"), // 14 ימים אחרי
  };

  it("APPROVED + בחלון refund + amount תקף — מותר", () => {
    const r = validateRefundPayment(baseInput);
    expect(r.allowed).toBe(true);
  });

  it("status PENDING — אסור (לא נחויב)", () => {
    const r = validateRefundPayment({
      ...baseInput,
      cardcomTransaction: { ...baseInput.cardcomTransaction, status: "PENDING" },
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("אושרה");
  });

  it("status DECLINED — אסור (לא היה תשלום מוצלח)", () => {
    const r = validateRefundPayment({
      ...baseInput,
      cardcomTransaction: { ...baseInput.cardcomTransaction, status: "DECLINED" },
    });
    expect(r.allowed).toBe(false);
  });

  it("transactionId חסר — אסור (אין מה להחזיר ב-Cardcom)", () => {
    const r = validateRefundPayment({
      ...baseInput,
      cardcomTransaction: { ...baseInput.cardcomTransaction, transactionId: null },
    });
    expect(r.allowed).toBe(false);
  });

  it(`עברו יותר מ-${REFUND_WINDOW_DAYS} ימים — אסור`, () => {
    const r = validateRefundPayment({
      ...baseInput,
      now: day("2026-12-01T00:00:00Z"), // 7 חודשים אחרי
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("חלון");
  });

  it("refund חלקי — מותר", () => {
    const r = validateRefundPayment({
      ...baseInput,
      refundAmount: 50,
    });
    expect(r.allowed).toBe(true);
  });

  it("refund שכבר כולל (refundedAmount=amount) — אסור", () => {
    const r = validateRefundPayment({
      ...baseInput,
      cardcomTransaction: {
        ...baseInput.cardcomTransaction,
        refundedAmount: 145,
      },
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("כבר");
  });

  it("refund חלקי שכבר חלק — מותר ל-remaining", () => {
    const r = validateRefundPayment({
      ...baseInput,
      refundAmount: 45,
      cardcomTransaction: {
        ...baseInput.cardcomTransaction,
        refundedAmount: 100, // נשאר 45
      },
    });
    expect(r.allowed).toBe(true);
  });

  it("refund חלקי שעולה על remaining — אסור", () => {
    const r = validateRefundPayment({
      ...baseInput,
      refundAmount: 50, // remaining = 45
      cardcomTransaction: {
        ...baseInput.cardcomTransaction,
        refundedAmount: 100,
      },
    });
    expect(r.allowed).toBe(false);
  });

  it("refundAmount=0 — אסור", () => {
    const r = validateRefundPayment({
      ...baseInput,
      refundAmount: 0,
    });
    expect(r.allowed).toBe(false);
  });

  it("refundAmount שלילי — אסור", () => {
    const r = validateRefundPayment({
      ...baseInput,
      refundAmount: -10,
    });
    expect(r.allowed).toBe(false);
  });
});

// ============================================================================
// calculateRefundableAmount — כמה נשאר ל-refund
// ============================================================================

describe("calculateRefundableAmount", () => {
  it("amount=145, refundedAmount=0 → 145", () => {
    expect(calculateRefundableAmount({ amount: 145, refundedAmount: 0 })).toBe(145);
  });
  it("amount=145, refundedAmount=50 → 95", () => {
    expect(calculateRefundableAmount({ amount: 145, refundedAmount: 50 })).toBe(95);
  });
  it("amount=145, refundedAmount=145 → 0", () => {
    expect(calculateRefundableAmount({ amount: 145, refundedAmount: 145 })).toBe(0);
  });
  it("refundedAmount > amount (לא אמור לקרות) → 0, לא שלילי", () => {
    expect(calculateRefundableAmount({ amount: 145, refundedAmount: 200 })).toBe(0);
  });
});
