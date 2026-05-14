// ============================================================================
// Tests: Subscription Settings (Stage 4 — דף ניהול מנוי למשתמש)
// ============================================================================
// TDD לפי feedback_critical_changes_process — שינוי קריטי (כסף!) חייב טסטים
// לפני impl. בדיקות כיסוי:
//   1. validateCanDisableAutoRenew — מי יכול לבטל חידוש אוטומטי
//   2. validateCanEnableAutoRenew — מי יכול להחזיר חידוש (דורש token שמור)
//   3. validateCanUpdateCard — מי יכול לעדכן את הכרטיס השמור
//   4. formatSubscriptionStatusHe — תרגום סטטוסים לעברית
//   5. formatCardExpiry / isCardExpiringWithin — תאריך תפוגה
//   6. resolveUpdateCardWebhookOutcome — webhook helper לעדכון כרטיס
//   7. buildPaymentHistoryView — תצוגת היסטוריית חיובים
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  validateCanDisableAutoRenew,
  validateCanEnableAutoRenew,
  validateCanUpdateCard,
  formatSubscriptionStatusHe,
  formatCardExpiry,
  isCardExpiringWithin,
  resolveUpdateCardWebhookOutcome,
  buildPaymentHistoryView,
} from "@/lib/payments/subscription-settings";

const day = (iso: string) => new Date(iso);

// ============================================================================
// validateCanDisableAutoRenew — ביטול חידוש אוטומטי
// ============================================================================

describe("validateCanDisableAutoRenew", () => {
  it("ACTIVE עם autoChargeEnabled=true ויש SubscriptionPayment פעיל — מותר", () => {
    const result = validateCanDisableAutoRenew({
      subscriptionStatus: "ACTIVE",
      billingPaidByClinic: false,
      hasActiveSubscriptionPayment: true,
      anyAutoChargeEnabled: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("TRIALING עם תשלום עתידי — מותר (יבטל חידוש לפני תקופה משולמת)", () => {
    const result = validateCanDisableAutoRenew({
      subscriptionStatus: "TRIALING",
      billingPaidByClinic: false,
      hasActiveSubscriptionPayment: true,
      anyAutoChargeEnabled: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("PAST_DUE — מותר (המשתמש רוצה לעצור חיובים)", () => {
    const result = validateCanDisableAutoRenew({
      subscriptionStatus: "PAST_DUE",
      billingPaidByClinic: false,
      hasActiveSubscriptionPayment: true,
      anyAutoChargeEnabled: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("billingPaidByClinic=true — אסור (הקליניקה משלמת, אין מה לבטל)", () => {
    const result = validateCanDisableAutoRenew({
      subscriptionStatus: "ACTIVE",
      billingPaidByClinic: true,
      hasActiveSubscriptionPayment: true,
      anyAutoChargeEnabled: true,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("הקליניקה");
  });

  it("CANCELLED — אסור (אין מנוי פעיל לבטל את החידוש שלו)", () => {
    const result = validateCanDisableAutoRenew({
      subscriptionStatus: "CANCELLED",
      billingPaidByClinic: false,
      hasActiveSubscriptionPayment: false,
      anyAutoChargeEnabled: false,
    });
    expect(result.allowed).toBe(false);
  });

  it("PAUSED — אסור (המנוי מושהה)", () => {
    const result = validateCanDisableAutoRenew({
      subscriptionStatus: "PAUSED",
      billingPaidByClinic: false,
      hasActiveSubscriptionPayment: true,
      anyAutoChargeEnabled: true,
    });
    expect(result.allowed).toBe(false);
  });

  it("ACTIVE אבל autoCharge כבר false — אסור (אין מה לבטל)", () => {
    const result = validateCanDisableAutoRenew({
      subscriptionStatus: "ACTIVE",
      billingPaidByClinic: false,
      hasActiveSubscriptionPayment: true,
      anyAutoChargeEnabled: false,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("כבר");
  });

  it("ACTIVE בלי SubscriptionPayment פעיל — אסור (חיוב הבא לא קיים)", () => {
    const result = validateCanDisableAutoRenew({
      subscriptionStatus: "ACTIVE",
      billingPaidByClinic: false,
      hasActiveSubscriptionPayment: false,
      anyAutoChargeEnabled: false,
    });
    expect(result.allowed).toBe(false);
  });
});

// ============================================================================
// validateCanEnableAutoRenew — הפעלת חידוש מחדש
// ============================================================================

describe("validateCanEnableAutoRenew", () => {
  it("ACTIVE עם token שמור + SubscriptionPayment פעיל — מותר", () => {
    const result = validateCanEnableAutoRenew({
      subscriptionStatus: "ACTIVE",
      billingPaidByClinic: false,
      isBlocked: false,
      hasActiveSavedCardToken: true,
      hasActiveSubscriptionPayment: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("PAST_DUE עם token שמור — מותר (יחזיר חיוב אוטומטי)", () => {
    const result = validateCanEnableAutoRenew({
      subscriptionStatus: "PAST_DUE",
      billingPaidByClinic: false,
      isBlocked: false,
      hasActiveSavedCardToken: true,
      hasActiveSubscriptionPayment: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("ACTIVE בלי token שמור — אסור (חייב להוסיף כרטיס קודם)", () => {
    const result = validateCanEnableAutoRenew({
      subscriptionStatus: "ACTIVE",
      billingPaidByClinic: false,
      isBlocked: false,
      hasActiveSavedCardToken: false,
      hasActiveSubscriptionPayment: true,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("כרטיס");
  });

  it("CANCELLED — אסור (אין מנוי פעיל)", () => {
    const result = validateCanEnableAutoRenew({
      subscriptionStatus: "CANCELLED",
      billingPaidByClinic: false,
      isBlocked: false,
      hasActiveSavedCardToken: true,
      hasActiveSubscriptionPayment: false,
    });
    expect(result.allowed).toBe(false);
  });

  it("isBlocked=true — אסור (חשבון חסום)", () => {
    const result = validateCanEnableAutoRenew({
      subscriptionStatus: "ACTIVE",
      billingPaidByClinic: false,
      isBlocked: true,
      hasActiveSavedCardToken: true,
      hasActiveSubscriptionPayment: true,
    });
    expect(result.allowed).toBe(false);
  });

  it("billingPaidByClinic — אסור", () => {
    const result = validateCanEnableAutoRenew({
      subscriptionStatus: "ACTIVE",
      billingPaidByClinic: true,
      isBlocked: false,
      hasActiveSavedCardToken: true,
      hasActiveSubscriptionPayment: true,
    });
    expect(result.allowed).toBe(false);
  });
});

// ============================================================================
// validateCanUpdateCard — מי יכול לעדכן כרטיס שמור
// ============================================================================

describe("validateCanUpdateCard", () => {
  it("ACTIVE — מותר", () => {
    const result = validateCanUpdateCard({
      subscriptionStatus: "ACTIVE",
      billingPaidByClinic: false,
      isBlocked: false,
    });
    expect(result.allowed).toBe(true);
  });

  it("TRIALING — מותר (שמירה מראש לתקופה משלום הבאה)", () => {
    const result = validateCanUpdateCard({
      subscriptionStatus: "TRIALING",
      billingPaidByClinic: false,
      isBlocked: false,
    });
    expect(result.allowed).toBe(true);
  });

  it("PAST_DUE — מותר (זה בדיוק המצב שבו צריך לעדכן כרטיס)", () => {
    const result = validateCanUpdateCard({
      subscriptionStatus: "PAST_DUE",
      billingPaidByClinic: false,
      isBlocked: false,
    });
    expect(result.allowed).toBe(true);
  });

  it("CANCELLED — אסור (אין למה לעדכן)", () => {
    const result = validateCanUpdateCard({
      subscriptionStatus: "CANCELLED",
      billingPaidByClinic: false,
      isBlocked: false,
    });
    expect(result.allowed).toBe(false);
  });

  it("PAUSED — אסור", () => {
    const result = validateCanUpdateCard({
      subscriptionStatus: "PAUSED",
      billingPaidByClinic: false,
      isBlocked: false,
    });
    expect(result.allowed).toBe(false);
  });

  it("billingPaidByClinic — אסור (הקליניקה משלמת)", () => {
    const result = validateCanUpdateCard({
      subscriptionStatus: "ACTIVE",
      billingPaidByClinic: true,
      isBlocked: false,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("הקליניקה");
  });

  it("isBlocked=true (חסום) — אסור גם ב-ACTIVE (לא נתמך באמת אבל defense in depth)", () => {
    const result = validateCanUpdateCard({
      subscriptionStatus: "ACTIVE",
      billingPaidByClinic: false,
      isBlocked: true,
    });
    expect(result.allowed).toBe(false);
  });
});

// ============================================================================
// formatSubscriptionStatusHe — תרגום סטטוסים לעברית
// ============================================================================

describe("formatSubscriptionStatusHe", () => {
  it("ACTIVE → פעיל", () => {
    expect(formatSubscriptionStatusHe("ACTIVE")).toBe("פעיל");
  });
  it("TRIALING → תקופת ניסיון", () => {
    expect(formatSubscriptionStatusHe("TRIALING")).toBe("תקופת ניסיון");
  });
  it("PAST_DUE → לתשלום", () => {
    expect(formatSubscriptionStatusHe("PAST_DUE")).toBe("לתשלום");
  });
  it("CANCELLED → בוטל", () => {
    expect(formatSubscriptionStatusHe("CANCELLED")).toBe("בוטל");
  });
  it("PAUSED → מושהה", () => {
    expect(formatSubscriptionStatusHe("PAUSED")).toBe("מושהה");
  });
});

// ============================================================================
// formatCardExpiry — MM/YYYY
// ============================================================================

describe("formatCardExpiry", () => {
  it("6/2028 → 06/2028", () => {
    expect(formatCardExpiry(6, 2028)).toBe("06/2028");
  });
  it("12/2026 → 12/2026", () => {
    expect(formatCardExpiry(12, 2026)).toBe("12/2026");
  });
  it("null + null → '-'", () => {
    expect(formatCardExpiry(null, null)).toBe("-");
  });
  it("חודש לא תקין (13) → '-' (הגנה defensive)", () => {
    expect(formatCardExpiry(13, 2028)).toBe("-");
  });
  it("שנה ישנה (1999) — עדיין מציג (הצגה לא ולידציה)", () => {
    // אנו מציגים מה שיש; ה-cron נפרד אחראי על expiry warning
    expect(formatCardExpiry(6, 1999)).toBe("06/1999");
  });
});

// ============================================================================
// isCardExpiringWithin — כרטיס בתפוגה
// ============================================================================

describe("isCardExpiringWithin", () => {
  it("כרטיס פג בתוך 30 ימים — מחזיר true", () => {
    const now = day("2026-06-15T00:00:00Z");
    const token = { expiryMonth: 6, expiryYear: 2026 }; // 30/06/2026 — בעוד 15 יום
    expect(isCardExpiringWithin(token, 30, now)).toBe(true);
  });

  it("כרטיס פג בעוד 46 יום (07/2026, מחוץ לטווח 30) — false", () => {
    const now = day("2026-06-15T00:00:00Z");
    const token = { expiryMonth: 7, expiryYear: 2026 }; // 31/07/2026
    expect(isCardExpiringWithin(token, 30, now)).toBe(false);
  });

  it("כרטיס שכבר פג — true", () => {
    const now = day("2026-06-15T00:00:00Z");
    const token = { expiryMonth: 4, expiryYear: 2026 }; // 30/04/2026 (עבר)
    expect(isCardExpiringWithin(token, 30, now)).toBe(true);
  });

  it("token=null → false", () => {
    const now = day("2026-06-15T00:00:00Z");
    expect(isCardExpiringWithin(null, 30, now)).toBe(false);
  });

  it("כרטיס תקף עוד שנה → false", () => {
    const now = day("2026-06-15T00:00:00Z");
    const token = { expiryMonth: 6, expiryYear: 2027 };
    expect(isCardExpiringWithin(token, 30, now)).toBe(false);
  });
});

// ============================================================================
// resolveUpdateCardWebhookOutcome — מה ה-webhook צריך לעשות עם UPDATE_CARD
// ============================================================================

describe("resolveUpdateCardWebhookOutcome", () => {
  it("success עם token + expiry תקין → CREATE_TOKEN", () => {
    const outcome = resolveUpdateCardWebhookOutcome({
      success: true,
      token: "tk_xxx",
      expiryMonth: 6,
      expiryYear: 28,
    });
    expect(outcome.action).toBe("CREATE_TOKEN");
    if (outcome.action === "CREATE_TOKEN") {
      expect(outcome.expiryYear).toBe(2028);
      expect(outcome.expiryMonth).toBe(6);
    }
  });

  it("success בלי token → SKIP (Cardcom החזיר OK אבל לא טוקן)", () => {
    const outcome = resolveUpdateCardWebhookOutcome({
      success: true,
      token: null,
      expiryMonth: 6,
      expiryYear: 28,
    });
    expect(outcome.action).toBe("SKIP_NO_TOKEN");
  });

  it("success עם token אבל expiry חסר → SKIP (לא נשמור טוקן בלי תוקף)", () => {
    const outcome = resolveUpdateCardWebhookOutcome({
      success: true,
      token: "tk_xxx",
      expiryMonth: null,
      expiryYear: 28,
    });
    expect(outcome.action).toBe("SKIP_INVALID_EXPIRY");
  });

  it("success עם expiryMonth=0 (לא תקין) → SKIP", () => {
    const outcome = resolveUpdateCardWebhookOutcome({
      success: true,
      token: "tk_xxx",
      expiryMonth: 0,
      expiryYear: 28,
    });
    expect(outcome.action).toBe("SKIP_INVALID_EXPIRY");
  });

  it("success עם expiryMonth=13 (לא תקין) → SKIP", () => {
    const outcome = resolveUpdateCardWebhookOutcome({
      success: true,
      token: "tk_xxx",
      expiryMonth: 13,
      expiryYear: 28,
    });
    expect(outcome.action).toBe("SKIP_INVALID_EXPIRY");
  });

  it("נכשל — DECLINE (לא לעדכן כרטיס; מציג למשתמש שגיאה)", () => {
    const outcome = resolveUpdateCardWebhookOutcome({
      success: false,
      token: null,
      expiryMonth: null,
      expiryYear: null,
    });
    expect(outcome.action).toBe("DECLINE");
  });
});

// ============================================================================
// buildPaymentHistoryView — תצוגת היסטוריית חיובים מסוריאליזת לClient
// ============================================================================

describe("buildPaymentHistoryView", () => {
  it("מתאם 10 חיובים האחרונים + invoice URL כשיש", () => {
    const payments = [
      {
        id: "sp1",
        amount: 145,
        currency: "ILS",
        status: "PAID" as const,
        description: "מנוי PRO חודשי",
        periodStart: day("2026-05-01T00:00:00Z"),
        periodEnd: day("2026-06-01T00:00:00Z"),
        paidAt: day("2026-05-01T09:30:00Z"),
        invoiceUrl: null,
        cardcomInvoices: [
          { pdfUrl: "https://cardcom.test/inv/123.pdf" },
        ],
      },
    ];
    const view = buildPaymentHistoryView(payments);
    expect(view).toHaveLength(1);
    expect(view[0]).toEqual({
      id: "sp1",
      amountIls: 145,
      currency: "ILS",
      statusKey: "paid",
      statusHe: "שולם",
      description: "מנוי PRO חודשי",
      periodStartIso: "2026-05-01T00:00:00.000Z",
      periodEndIso: "2026-06-01T00:00:00.000Z",
      paidAtIso: "2026-05-01T09:30:00.000Z",
      invoicePdfUrl: "https://cardcom.test/inv/123.pdf",
    });
  });

  it("PENDING → 'ממתין'", () => {
    const view = buildPaymentHistoryView([
      {
        id: "sp2",
        amount: 100,
        currency: "ILS",
        status: "PENDING" as const,
        description: null,
        periodStart: null,
        periodEnd: null,
        paidAt: null,
        invoiceUrl: null,
        cardcomInvoices: [],
      },
    ]);
    expect(view[0].statusKey).toBe("pending");
    expect(view[0].statusHe).toBe("ממתין");
    expect(view[0].invoicePdfUrl).toBeNull();
    expect(view[0].paidAtIso).toBeNull();
  });

  it("CANCELLED → 'בוטל'", () => {
    const view = buildPaymentHistoryView([
      {
        id: "sp3",
        amount: 0,
        currency: "ILS",
        status: "CANCELLED" as const,
        description: null,
        periodStart: null,
        periodEnd: null,
        paidAt: null,
        invoiceUrl: null,
        cardcomInvoices: [],
      },
    ]);
    expect(view[0].statusKey).toBe("cancelled");
    expect(view[0].statusHe).toBe("בוטל");
  });

  it("OVERDUE → 'באיחור'", () => {
    const view = buildPaymentHistoryView([
      {
        id: "sp4",
        amount: 145,
        currency: "ILS",
        status: "OVERDUE" as const,
        description: null,
        periodStart: null,
        periodEnd: null,
        paidAt: null,
        invoiceUrl: null,
        cardcomInvoices: [],
      },
    ]);
    expect(view[0].statusKey).toBe("overdue");
    expect(view[0].statusHe).toBe("באיחור");
  });

  it("REFUNDED → 'הוחזר'", () => {
    const view = buildPaymentHistoryView([
      {
        id: "sp5",
        amount: 145,
        currency: "ILS",
        status: "REFUNDED" as const,
        description: null,
        periodStart: null,
        periodEnd: null,
        paidAt: null,
        invoiceUrl: null,
        cardcomInvoices: [],
      },
    ]);
    expect(view[0].statusKey).toBe("refunded");
    expect(view[0].statusHe).toBe("הוחזר");
  });

  it("invoiceUrl ב-SubscriptionPayment גובר אם אין cardcomInvoices", () => {
    const view = buildPaymentHistoryView([
      {
        id: "sp6",
        amount: 100,
        currency: "ILS",
        status: "PAID" as const,
        description: null,
        periodStart: null,
        periodEnd: null,
        paidAt: day("2026-05-01T00:00:00Z"),
        invoiceUrl: "https://legacy.test/inv.pdf",
        cardcomInvoices: [],
      },
    ]);
    expect(view[0].invoicePdfUrl).toBe("https://legacy.test/inv.pdf");
  });

  it("cardcomInvoices עם pdfUrl=null → invoicePdfUrl=null (לא לעטוף)", () => {
    const view = buildPaymentHistoryView([
      {
        id: "sp7",
        amount: 100,
        currency: "ILS",
        status: "PAID" as const,
        description: null,
        periodStart: null,
        periodEnd: null,
        paidAt: day("2026-05-01T00:00:00Z"),
        invoiceUrl: null,
        cardcomInvoices: [{ pdfUrl: null }],
      },
    ]);
    expect(view[0].invoicePdfUrl).toBeNull();
  });

  it("Decimal amount (Prisma) — מומר ל-number", () => {
    // simulate Prisma Decimal — kept as type with toString
    const view = buildPaymentHistoryView([
      {
        id: "sp8",
        amount: "145.50" as unknown as number,
        currency: "ILS",
        status: "PAID" as const,
        description: null,
        periodStart: null,
        periodEnd: null,
        paidAt: day("2026-05-01T00:00:00Z"),
        invoiceUrl: null,
        cardcomInvoices: [],
      },
    ]);
    expect(view[0].amountIls).toBe(145.5);
  });

  it("רשימה ריקה → []", () => {
    expect(buildPaymentHistoryView([])).toEqual([]);
  });
});
