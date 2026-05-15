// ============================================================================
// Admin Payment Actions — Pure Helpers (Stage 6)
// ============================================================================
// פונקציות טהורות (ללא DB / HTTP) ל-refund_payment דרך Cardcom על
// SubscriptionPayment APPROVED. אדמין grant_package נמצא במקום אחר
// (admin-subscription-actions.ts של הצ'אט המקביל).
//
// כל שינוי כאן חייב להתחיל בעדכון admin-payment-actions.test.ts (כסף!).
// ============================================================================

import type { CardcomTxStatus } from "@prisma/client";

export type ValidationResult =
  | { allowed: true }
  | { allowed: false; reason: string };

// ============================================================================
// REFUND_WINDOW_DAYS — חלון refund 180 יום
// ============================================================================
// 6 חודשים נדיב יותר מ-14 הימים של חוק הגנת הצרכן ללקוח (זה refund של אדמין —
// פיצוי / טעות, לא ביטול חוקי). מספיק לקדם תקופה רב-חודשית מלאה ועוד שולי קצבה.

export const REFUND_WINDOW_DAYS = 180;

// ============================================================================
// validateRefundPayment — אדמין מבצע refund על CardcomTransaction APPROVED
// ============================================================================

export function validateRefundPayment(input: {
  cardcomTransaction: {
    status: CardcomTxStatus;
    amount: number;
    refundedAmount: number;
    completedAt: Date | null;
    transactionId: string | null;
  };
  refundAmount: number;
  now: Date;
}): ValidationResult {
  const tx = input.cardcomTransaction;

  if (tx.status !== "APPROVED") {
    return {
      allowed: false,
      reason: "ניתן לבצע refund רק על עסקה שאושרה.",
    };
  }
  if (!tx.transactionId) {
    return {
      allowed: false,
      reason:
        "ה-CardcomTransaction חסר transactionId — אין מה להחזיר ב-Cardcom.",
    };
  }
  if (!tx.completedAt) {
    return {
      allowed: false,
      reason: "ה-CardcomTransaction חסר completedAt — לא ניתן לחשב חלון refund.",
    };
  }

  const ageMs = input.now.getTime() - tx.completedAt.getTime();
  const windowMs = REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (ageMs > windowMs) {
    return {
      allowed: false,
      reason: `חלון ה-refund (${REFUND_WINDOW_DAYS} ימים) חלף. נדרש refund ידני ב-Cardcom.`,
    };
  }

  if (!Number.isFinite(input.refundAmount) || input.refundAmount <= 0) {
    return { allowed: false, reason: "סכום ה-refund חייב להיות חיובי." };
  }

  const remaining = calculateRefundableAmount({
    amount: tx.amount,
    refundedAmount: tx.refundedAmount,
  });
  if (remaining <= 0) {
    return {
      allowed: false,
      reason: "הסכום כבר הוחזר במלואו.",
    };
  }
  if (input.refundAmount > remaining) {
    return {
      allowed: false,
      reason: `סכום ה-refund (${input.refundAmount}) עולה על היתרה הזמינה (${remaining}).`,
    };
  }

  return { allowed: true };
}

// ============================================================================
// calculateRefundableAmount — כמה נשאר להחזיר
// ============================================================================

export function calculateRefundableAmount(input: {
  amount: number;
  refundedAmount: number;
}): number {
  const remaining = input.amount - input.refundedAmount;
  return remaining > 0 ? remaining : 0;
}
