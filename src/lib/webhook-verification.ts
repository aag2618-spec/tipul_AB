// src/lib/webhook-verification.ts
// אימות בעלות בwebhooks — מונע IDOR שבו תוקף יכול לשלוח webhook
// עם paymentId/therapistId שלא תואמים בDB.
//
// העיקרון: לעולם לא לסמוך על customFields.therapistId שמגיע ב-payload.
// תמיד לאמת את ה-paymentId מול DB ולקבל את ה-therapistId האמיתי משם.

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type VerifiedPayment = {
  paymentId: string;
  therapistId: string;
  clientId: string | null;
  clientName: string | null;
  status: string;
  amount: number;
  expectedAmount: number;
};

/**
 * מאמת שpayment קיים בDB ושייך למטפל אמיתי.
 * מחזיר את הנתונים האמיתיים מDB (לא מה-payload), כולל therapistId המאומת.
 *
 * @param paymentId — ה-paymentId שהגיע ב-webhook payload
 * @param expectedTherapistId — אופציונלי: אם ה-payload טוען על therapistId,
 *   נבדוק שהוא תואם ל-DB (אם לא — חשוד, נחזיר null)
 * @returns VerifiedPayment אם הכל תקין, null אחרת
 */
export async function verifyPaymentOwnership(
  paymentId: string | undefined | null,
  expectedTherapistId?: string | null
): Promise<VerifiedPayment | null> {
  if (!paymentId || typeof paymentId !== "string" || paymentId.length < 5) {
    logger.warn("[WebhookVerify] Missing or invalid paymentId", { paymentId });
    return null;
  }

  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        status: true,
        amount: true,
        expectedAmount: true,
        clientId: true,
        client: {
          select: {
            therapistId: true,
            name: true,
          },
        },
      },
    });

    if (!payment) {
      logger.warn("[WebhookVerify] Payment not found in DB", { paymentId });
      return null;
    }

    if (!payment.client?.therapistId) {
      logger.warn("[WebhookVerify] Payment has no therapist association", {
        paymentId,
      });
      return null;
    }

    // Cross-check: אם ה-payload טען על therapistId — חייב להתאים ל-DB
    if (
      expectedTherapistId &&
      expectedTherapistId !== payment.client.therapistId
    ) {
      logger.error(
        "[WebhookVerify] therapistId mismatch — possible attack",
        {
          paymentId,
          payloadTherapistId: expectedTherapistId,
          dbTherapistId: payment.client.therapistId,
        }
      );
      return null;
    }

    return {
      paymentId: payment.id,
      therapistId: payment.client.therapistId,
      clientId: payment.clientId,
      clientName: payment.client.name,
      status: payment.status,
      amount: Number(payment.amount) || 0,
      expectedAmount: Number(payment.expectedAmount) || 0,
    };
  } catch (error) {
    logger.error("[WebhookVerify] DB error during verification", {
      paymentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Best-effort lookup לpayment ע"י PaymentID חיצוני שנשמר ב-notes.
 * שימוש: Sumit webhook שולח PaymentID חיצוני במקום ה-Payment.id הפנימי.
 * מחזיר את ה-VerifiedPayment האמיתי (כולל therapistId מ-DB).
 *
 * הגבלה: מחפש רק payments ב-status PENDING (משלום שלא טופל עדיין).
 */
export async function verifyPaymentByExternalId(
  externalPaymentId: string | undefined | null
): Promise<VerifiedPayment | null> {
  if (!externalPaymentId || typeof externalPaymentId !== "string") {
    return null;
  }

  try {
    const payment = await prisma.payment.findFirst({
      where: {
        notes: { contains: externalPaymentId },
        status: "PENDING",
      },
      select: {
        id: true,
        status: true,
        amount: true,
        expectedAmount: true,
        clientId: true,
        client: {
          select: {
            therapistId: true,
            name: true,
          },
        },
      },
    });

    if (!payment || !payment.client?.therapistId) {
      logger.warn("[WebhookVerify] No PENDING payment found by external ID", {
        externalPaymentId,
      });
      return null;
    }

    return {
      paymentId: payment.id,
      therapistId: payment.client.therapistId,
      clientId: payment.clientId,
      clientName: payment.client.name,
      status: payment.status,
      amount: Number(payment.amount) || 0,
      expectedAmount: Number(payment.expectedAmount) || 0,
    };
  } catch (error) {
    logger.error("[WebhookVerify] DB error during external ID lookup", {
      externalPaymentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
