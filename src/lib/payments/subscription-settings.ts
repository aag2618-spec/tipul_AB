// ============================================================================
// Subscription Settings — Pure Helpers (Stage 4)
// ============================================================================
// פונקציות טהורות (ללא DB / HTTP) ל-decision logic של דף /dashboard/settings/
// subscription. מופרדות מ-routes כדי לאפשר TDD מלא ב-vitest בלי mocks.
//
// כל שינוי כאן חייב להתחיל בעדכון subscription-settings.test.ts (כסף!).
// ============================================================================

import type { SubscriptionStatus, SubscriptionPaymentStatus } from "@prisma/client";

// ============================================================================
// סוגי תוצאות
// ============================================================================

export type ValidationResult =
  | { allowed: true }
  | { allowed: false; reason: string };

// ============================================================================
// validateCanDisableAutoRenew — האם מותר לבטל חידוש אוטומטי
// ============================================================================

export function validateCanDisableAutoRenew(input: {
  subscriptionStatus: SubscriptionStatus;
  billingPaidByClinic: boolean;
  hasActiveSubscriptionPayment: boolean;
  anyAutoChargeEnabled: boolean;
}): ValidationResult {
  if (input.billingPaidByClinic) {
    return {
      allowed: false,
      reason: "המנוי משולם ע״י הקליניקה — אין חידוש אישי לבטל.",
    };
  }
  if (input.subscriptionStatus === "CANCELLED") {
    return { allowed: false, reason: "אין מנוי פעיל לבטל." };
  }
  if (input.subscriptionStatus === "PAUSED") {
    return { allowed: false, reason: "המנוי מושהה — אין חידוש פעיל." };
  }
  if (!input.hasActiveSubscriptionPayment) {
    return {
      allowed: false,
      reason: "לא נמצאה רשומת חיוב פעילה לבטל את החידוש שלה.",
    };
  }
  if (!input.anyAutoChargeEnabled) {
    return {
      allowed: false,
      reason: "החידוש האוטומטי כבר כבוי.",
    };
  }
  return { allowed: true };
}

// ============================================================================
// validateCanEnableAutoRenew — האם מותר להחזיר חידוש (re-enable)
// ============================================================================

export function validateCanEnableAutoRenew(input: {
  subscriptionStatus: SubscriptionStatus;
  billingPaidByClinic: boolean;
  isBlocked: boolean;
  hasActiveSavedCardToken: boolean;
  hasActiveSubscriptionPayment: boolean;
}): ValidationResult {
  if (input.billingPaidByClinic) {
    return {
      allowed: false,
      reason: "המנוי משולם ע״י הקליניקה — לא ניתן להפעיל חידוש אישי.",
    };
  }
  if (input.isBlocked) {
    return {
      allowed: false,
      reason: "החשבון חסום — פנה/י לתמיכה לפני הפעלת חידוש.",
    };
  }
  if (input.subscriptionStatus === "CANCELLED") {
    return {
      allowed: false,
      reason: "אין מנוי פעיל — יש לרכוש מנוי חדש קודם.",
    };
  }
  if (input.subscriptionStatus === "PAUSED") {
    return { allowed: false, reason: "המנוי מושהה." };
  }
  if (!input.hasActiveSavedCardToken) {
    return {
      allowed: false,
      reason: "יש להוסיף כרטיס תקף לפני הפעלת חידוש אוטומטי.",
    };
  }
  if (!input.hasActiveSubscriptionPayment) {
    return {
      allowed: false,
      reason: "לא נמצאה רשומת חיוב פעילה.",
    };
  }
  return { allowed: true };
}

// ============================================================================
// validateCanUpdateCard — האם מותר לעדכן כרטיס שמור
// ============================================================================

export function validateCanUpdateCard(input: {
  subscriptionStatus: SubscriptionStatus;
  billingPaidByClinic: boolean;
  isBlocked: boolean;
}): ValidationResult {
  if (input.billingPaidByClinic) {
    return {
      allowed: false,
      reason: "המנוי משולם ע״י הקליניקה — אין צורך בכרטיס אישי.",
    };
  }
  if (input.isBlocked) {
    return {
      allowed: false,
      reason: "החשבון חסום — פנה/י לתמיכה.",
    };
  }
  if (input.subscriptionStatus === "CANCELLED") {
    return {
      allowed: false,
      reason: "אין מנוי פעיל — יש לרכוש מנוי חדש קודם.",
    };
  }
  if (input.subscriptionStatus === "PAUSED") {
    return { allowed: false, reason: "המנוי מושהה." };
  }
  // ACTIVE / TRIALING / PAST_DUE — מותר
  return { allowed: true };
}

// ============================================================================
// formatSubscriptionStatusHe — סטטוס בעברית
// ============================================================================

const STATUS_HE: Record<SubscriptionStatus, string> = {
  ACTIVE: "פעיל",
  TRIALING: "תקופת ניסיון",
  PAST_DUE: "לתשלום",
  CANCELLED: "בוטל",
  PAUSED: "מושהה",
};

export function formatSubscriptionStatusHe(status: SubscriptionStatus): string {
  return STATUS_HE[status] ?? status;
}

// ============================================================================
// formatCardExpiry — MM/YYYY (תצוגה בלבד; לא ולידציה)
// ============================================================================

export function formatCardExpiry(
  month: number | null,
  year: number | null
): string {
  if (
    month === null ||
    year === null ||
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12
  ) {
    return "-";
  }
  const mm = String(month).padStart(2, "0");
  return `${mm}/${year}`;
}

// ============================================================================
// isCardExpiringWithin — האם הכרטיס פג בעוד N ימים (כולל פג כבר)
// ============================================================================

export function isCardExpiringWithin(
  token: { expiryMonth: number; expiryYear: number } | null,
  daysAhead: number,
  now: Date
): boolean {
  if (!token) return false;
  // יום אחרון של חודש התפוגה.
  // לדוגמה expiry 07/2026 → תפוגה ב-31/07/2026 23:59:59 UTC.
  // יוצרים Date של היום הראשון של החודש הבא (08/2026), ומחסירים שנייה.
  const expiryDate = new Date(
    Date.UTC(token.expiryYear, token.expiryMonth, 1, 0, 0, 0, 0) - 1000
  );
  const threshold = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  return expiryDate.getTime() <= threshold.getTime();
}

// ============================================================================
// resolveUpdateCardWebhookOutcome — webhook decision logic ל-UPDATE_CARD
// ============================================================================

export type UpdateCardOutcome =
  | {
      action: "CREATE_TOKEN";
      expiryMonth: number;
      expiryYear: number; // 4-digit year (e.g. 2028)
    }
  | { action: "SKIP_NO_TOKEN" }
  | { action: "SKIP_INVALID_EXPIRY" }
  | { action: "DECLINE" };

export function resolveUpdateCardWebhookOutcome(input: {
  success: boolean;
  token: string | null;
  expiryMonth: number | null;
  expiryYear: number | null; // 2-digit (YY from Cardcom)
}): UpdateCardOutcome {
  if (!input.success) {
    return { action: "DECLINE" };
  }
  if (!input.token) {
    return { action: "SKIP_NO_TOKEN" };
  }
  const mm = input.expiryMonth;
  const yy = input.expiryYear;
  if (
    mm === null ||
    yy === null ||
    !Number.isInteger(mm) ||
    !Number.isInteger(yy) ||
    mm < 1 ||
    mm > 12
  ) {
    return { action: "SKIP_INVALID_EXPIRY" };
  }
  return {
    action: "CREATE_TOKEN",
    expiryMonth: mm,
    expiryYear: 2000 + yy,
  };
}

// ============================================================================
// buildPaymentHistoryView — תצוגה מסוריאליזת ל-Client
// ============================================================================

const PAYMENT_STATUS_KEY: Record<SubscriptionPaymentStatus, string> = {
  PENDING: "pending",
  PAID: "paid",
  OVERDUE: "overdue",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
};

const PAYMENT_STATUS_HE: Record<SubscriptionPaymentStatus, string> = {
  PENDING: "ממתין",
  PAID: "שולם",
  OVERDUE: "באיחור",
  CANCELLED: "בוטל",
  REFUNDED: "הוחזר",
};

export interface PaymentHistoryInput {
  id: string;
  amount: number | string | { toString(): string }; // Prisma Decimal compatibility
  currency: string;
  status: SubscriptionPaymentStatus;
  description: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  invoiceUrl: string | null;
  cardcomInvoices: Array<{ pdfUrl: string | null }>;
}

export interface PaymentHistoryItem {
  id: string;
  amountIls: number;
  currency: string;
  statusKey: string;
  statusHe: string;
  description: string | null;
  periodStartIso: string | null;
  periodEndIso: string | null;
  paidAtIso: string | null;
  invoicePdfUrl: string | null;
}

export function buildPaymentHistoryView(
  payments: PaymentHistoryInput[]
): PaymentHistoryItem[] {
  return payments.map((p) => {
    // pdfUrl מ-Cardcom invoice ראשון שיש לו URL; אחרת fallback ל-invoiceUrl legacy
    const cardcomPdf =
      p.cardcomInvoices.find((inv) => inv.pdfUrl !== null)?.pdfUrl ?? null;
    const invoicePdfUrl = cardcomPdf ?? p.invoiceUrl ?? null;

    return {
      id: p.id,
      amountIls: Number(p.amount) || 0,
      currency: p.currency,
      statusKey: PAYMENT_STATUS_KEY[p.status] ?? "pending",
      statusHe: PAYMENT_STATUS_HE[p.status] ?? "ממתין",
      description: p.description,
      periodStartIso: p.periodStart ? p.periodStart.toISOString() : null,
      periodEndIso: p.periodEnd ? p.periodEnd.toISOString() : null,
      paidAtIso: p.paidAt ? p.paidAt.toISOString() : null,
      invoicePdfUrl,
    };
  });
}
