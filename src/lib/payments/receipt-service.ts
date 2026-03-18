import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { createPaymentReceiptEmail } from "@/lib/email-templates/payment-receipt";
import { createBillingService } from "@/lib/billing";
import { getReceiptPageUrl } from "@/lib/receipt-token";
import { mapPaymentMethod } from "@/lib/email-utils";
import { calculateDebtFromPayments } from "@/lib/payment-utils";
import { logger } from "@/lib/logger";
import type { PaymentMethod, ReceiptResult } from "./types";

// ================================================================
// issueReceipt
// ================================================================

export async function issueReceipt(params: {
  userId: string;
  paymentId: string;
  amount: number;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  description: string;
  method: PaymentMethod;
}): Promise<ReceiptResult> {
  const therapist = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { businessType: true },
  });

  if (!therapist || therapist.businessType === "NONE") {
    return { receiptNumber: null, receiptUrl: null, hasReceipt: false };
  }

  if (therapist.businessType === "EXEMPT") {
    const receiptUser = await prisma.user.update({
      where: { id: params.userId },
      data: { nextReceiptNumber: { increment: 1 } },
      select: { nextReceiptNumber: true },
    });
    const reservedNumber = (receiptUser.nextReceiptNumber ?? 2) - 1;
    const year = new Date().getFullYear();
    const receiptNumber = `${year}-${String(reservedNumber).padStart(4, "0")}`;
    const receiptUrl = getReceiptPageUrl(params.paymentId);

    await prisma.payment.update({
      where: { id: params.paymentId },
      data: { receiptNumber, receiptUrl, hasReceipt: true },
    });

    return { receiptNumber, receiptUrl, hasReceipt: true };
  }

  // עוסק מורשה — billing provider
  try {
    const billingService = createBillingService(params.userId);
    const result = await billingService.createReceipt({
      clientName: params.clientName,
      clientEmail: params.clientEmail,
      clientPhone: params.clientPhone,
      amount: params.amount,
      description: params.description,
      paymentMethod: mapPaymentMethod(params.method),
      sendEmail: false,
    });

    if (result.success) {
      const receiptUrl = result.receiptUrl || null;
      const receiptNumber = result.receiptNumber || null;

      await prisma.payment.update({
        where: { id: params.paymentId },
        data: { receiptUrl, receiptNumber, hasReceipt: true },
      });
      return { receiptNumber, receiptUrl, hasReceipt: true };
    }

    logger.error("Billing receipt creation failed", { error: String(result.error) });
    return {
      receiptNumber: null,
      receiptUrl: null,
      hasReceipt: false,
      error: result.error || "שגיאה ביצירת קבלה בספק החיוב",
    };
  } catch (err) {
    logger.error("Error creating receipt via billing provider", { error: err instanceof Error ? err.message : String(err) });
    return {
      receiptNumber: null,
      receiptUrl: null,
      hasReceipt: false,
      error: err instanceof Error ? err.message : "שגיאה ביצירת קבלה",
    };
  }
}

// ================================================================
// sendPaymentReceiptEmail
// ================================================================

export async function sendPaymentReceiptEmail(params: {
  userId: string;
  clientId: string;
  amountPaid: number;
  expectedAmount: number;
  method: string;
  paidAt: Date;
  session?: { startTime: Date; type: string } | null;
  receiptUrl?: string | null;
  receiptNumber?: string | null;
  sessionRemainingAfterPayment?: number;
}): Promise<void> {
  try {
    const commSettings = await prisma.communicationSetting.findUnique({
      where: { userId: params.userId },
    });
    if (commSettings?.sendPaymentReceipt === false) return;

    const therapist = await prisma.user.findUnique({
      where: { id: params.userId },
    });
    const client = await prisma.client.findUnique({
      where: { id: params.clientId },
    });
    if (!client) return;

    const allPending = await prisma.payment.findMany({
      where: {
        clientId: params.clientId,
        status: "PENDING",
        parentPaymentId: null,
      },
    });
    const remainingDebt = calculateDebtFromPayments(allPending);

    const sessionRemaining = params.sessionRemainingAfterPayment ?? (params.expectedAmount - params.amountPaid);

    const { subject, html } = createPaymentReceiptEmail({
      clientName: client.name,
      therapistName: therapist?.name || "המטפל/ת שלך",
      therapistPhone:
        therapist?.businessPhone || therapist?.phone || undefined,
      payment: {
        amount: params.amountPaid,
        expectedAmount: params.expectedAmount,
        method: params.method,
        paidAt: params.paidAt,
        sessionRemainingAfterPayment: Math.max(0, sessionRemaining),
        session: params.session || undefined,
        receiptUrl: params.receiptUrl || undefined,
        receiptNumber: params.receiptNumber || undefined,
      },
      clientBalance: {
        remainingDebt,
        credit: Number(client.creditBalance),
      },
      customization: {
        paymentInstructions: commSettings?.paymentInstructions,
        paymentLink: commSettings?.paymentLink,
        emailSignature: commSettings?.emailSignature,
        customGreeting: commSettings?.customGreeting,
        customClosing: commSettings?.customClosing,
        businessHours: commSettings?.businessHours,
      },
    });

    if (commSettings?.sendReceiptToClient !== false && client.email) {
      const emailResult = await sendEmail({ to: client.email, subject, html });
      await prisma.communicationLog.create({
        data: {
          type: "CUSTOM",
          channel: "EMAIL",
          recipient: client.email.toLowerCase(),
          subject,
          content: html,
          status: "SENT",
          sentAt: new Date(),
          messageId: emailResult.messageId || null,
          clientId: params.clientId,
          userId: params.userId,
        },
      });
    }

    if (commSettings?.sendReceiptToTherapist !== false && therapist?.email) {
      await sendEmail({
        to: therapist.email,
        subject: `[עותק] ${subject}`,
        html,
      });
    }
  } catch (err) {
    logger.error("Error sending payment receipt email", { error: err instanceof Error ? err.message : String(err) });
  }
}

// ================================================================
// completeWebhookPayment - called by webhooks after updating Payment
// Sends receipt email + completes COLLECT_PAYMENT task
// This is the "connector pipe" between webhooks and the payment trunk
// ================================================================

export async function completeWebhookPayment(paymentId: string): Promise<void> {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        session: { select: { startTime: true, type: true } },
        client: { select: { id: true, therapistId: true } },
      },
    });

    if (!payment || !payment.client) return;

    const { client } = payment;

    // 1. Send receipt email to client (respects therapist's communication settings)
    await sendPaymentReceiptEmail({
      userId: client.therapistId,
      clientId: client.id,
      amountPaid: Number(payment.amount),
      expectedAmount: Number(payment.expectedAmount),
      method: payment.method,
      paidAt: payment.paidAt || new Date(),
      session: payment.session,
      receiptUrl: payment.receiptUrl,
      receiptNumber: payment.receiptNumber,
    }).catch(err => logger.error("Webhook receipt email failed", { error: err instanceof Error ? err.message : String(err) }));

    // 2. Complete COLLECT_PAYMENT task if this payment is now fully paid
    if (payment.status === "PAID") {
      await prisma.task.updateMany({
        where: {
          userId: client.therapistId,
          type: "COLLECT_PAYMENT",
          status: { in: ["PENDING", "IN_PROGRESS"] },
          description: { contains: paymentId },
        },
        data: { status: "COMPLETED" },
      });
    }
  } catch (err) {
    // Non-critical: webhook already updated the payment, this is supplementary
    logger.error("completeWebhookPayment error", { error: err instanceof Error ? err.message : String(err) });
  }
}

// ================================================================
// Helpers
// ================================================================

export function buildReceiptDescription(
  session: { startTime: Date } | null | undefined,
  isPartial: boolean,
  amountPaid: number,
  expectedAmount: number
): string {
  const sessionDate = session
    ? new Date(session.startTime).toLocaleDateString("he-IL", {
        timeZone: "Asia/Jerusalem",
      })
    : null;
  let desc = sessionDate
    ? `תשלום עבור פגישה בתאריך ${sessionDate}`
    : `תשלום עבור טיפול`;
  if (isPartial) {
    desc += ` (תשלום חלקי - ₪${amountPaid} מתוך ₪${expectedAmount})`;
  }
  return desc;
}
