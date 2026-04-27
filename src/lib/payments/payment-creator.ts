import prisma from "@/lib/prisma";
import { type Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import type { PaymentMethod, PaymentType, PaymentResult, PaymentStatus, ReceiptResult } from "./types";
import { issueReceipt, sendPaymentReceiptEmail, buildReceiptDescription } from "./receipt-service";

// ================================================================
// Helpers
// ================================================================

async function deductCredit(
  clientId: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  const result = await prisma.client.updateMany({
    where: { id: clientId, creditBalance: { gte: amount } },
    data: { creditBalance: { decrement: amount } },
  });
  if (result.count === 0) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { creditBalance: true },
    });
    return {
      success: false,
      error: `אין מספיק קרדיט. זמין: ₪${Number(
        client?.creditBalance || 0
      ).toFixed(0)}, מבוקש: ₪${amount.toFixed(0)}`,
    };
  }
  return { success: true };
}

// ================================================================
// createPaymentForSession
// ================================================================

export async function createPaymentForSession(params: {
  userId: string;
  clientId: string;
  sessionId?: string | null;
  amount: number;
  expectedAmount: number;
  method: PaymentMethod;
  paymentType: PaymentType;
  status?: PaymentStatus;
  issueReceipt?: boolean;
  notes?: string;
  creditUsed?: number;
}): Promise<PaymentResult> {
  try {
    const {
      userId,
      clientId,
      sessionId,
      amount,
      expectedAmount,
      method,
      paymentType,
      status: requestedStatus,
      issueReceipt: shouldIssueReceipt,
      notes,
      creditUsed,
    } = params;

    const client = await prisma.client.findFirst({
      where: { id: clientId, therapistId: userId },
    });
    if (!client) return { success: false, error: "מטופל לא נמצא" };

    // Credit deduction
    if (creditUsed && creditUsed > 0) {
      const cr = await deductCredit(clientId, creditUsed);
      if (!cr.success) return { success: false, error: cr.error };
    }

    // Check for existing session payment
    const existingPayment = sessionId
      ? await prisma.payment.findUnique({
          where: { sessionId },
          include: { client: true, session: true },
        })
      : null;

    let payment: Prisma.PaymentGetPayload<{ include: { client: true; session: true } }>;
    let childPayment = null;

    if (existingPayment) {
      const existingAmount = Number(existingPayment.amount);
      const expAmt = Number(existingPayment.expectedAmount) || expectedAmount;

      if (existingAmount === 0 && paymentType !== "PARTIAL") {
        // First actual payment on a zero-amount debt record — update directly
        const finalStatus = amount >= expAmt ? "PAID" : "PENDING";
        payment = await prisma.payment.update({
          where: { sessionId: sessionId! },
          data: {
            amount,
            expectedAmount: expAmt,
            paymentType,
            method,
            status: finalStatus,
            paidAt: finalStatus === "PAID" ? new Date() : null,
            notes: notes || null,
          },
          include: { client: true, session: true },
        });
      } else {
        // Has existing amount OR paymentType is PARTIAL → create child
        childPayment = await prisma.payment.create({
          data: {
            parentPaymentId: existingPayment.id,
            clientId,
            amount,
            expectedAmount: amount,
            method,
            status: "PAID",
            paidAt: new Date(),
            paymentType: "PARTIAL",
          },
        });
        const newTotal = existingAmount + amount;
        const finalStatus = newTotal >= expAmt ? "PAID" : "PENDING";
        payment = await prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            amount: newTotal,
            status: finalStatus,
            paymentType: finalStatus === "PAID" ? "FULL" : "PARTIAL",
            paidAt: finalStatus === "PAID" ? new Date() : existingPayment.paidAt,
          },
          include: { client: true, session: true },
        });
      }
    } else {
      // No existing payment — create new
      const derivedStatus =
        requestedStatus ||
        (amount >= expectedAmount ? "PAID" : "PENDING");

      const isFirstPartial =
        amount > 0 && expectedAmount > 0 && amount < expectedAmount;

      payment = await prisma.payment.create({
        data: {
          clientId,
          sessionId: sessionId || null,
          amount,
          expectedAmount: expectedAmount || amount,
          paymentType: isFirstPartial ? "PARTIAL" : paymentType,
          method,
          status: derivedStatus,
          paidAt: derivedStatus === "PAID" ? new Date() : null,
          notes: notes || null,
        },
        include: { client: true, session: true },
      });

      if (isFirstPartial) {
        childPayment = await prisma.payment.create({
          data: {
            parentPaymentId: payment.id,
            clientId,
            amount,
            expectedAmount: amount,
            method,
            status: "PAID",
            paidAt: new Date(),
            paymentType: "PARTIAL",
          },
        });
      }
    }

    // ADVANCE → add to credit balance
    if (paymentType === "ADVANCE") {
      await prisma.client.update({
        where: { id: clientId },
        data: { creditBalance: { increment: amount } },
      });
    }

    // Create collection task for new partial payments
    if (paymentType === "PARTIAL" && !existingPayment) {
      const remaining = (expectedAmount || amount) - amount;
      if (remaining > 0) {
        await prisma.task.create({
          data: {
            userId,
            type: "COLLECT_PAYMENT",
            title: `גבה יתרת תשלום מ-${client.name} - ₪${remaining}`,
            status: "PENDING",
            priority: "MEDIUM",
            relatedEntityId: payment.id,
            relatedEntity: "Payment",
          },
        });
      }
    }

    // Complete collection task if fully paid
    if (payment.status === "PAID") {
      await prisma.task.updateMany({
        where: {
          userId,
          relatedEntityId: payment.id,
          type: "COLLECT_PAYMENT",
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        data: { status: "COMPLETED" },
      });
    }

    // Receipt — issue for any actual payment (not just when parent is PAID)
    let receiptResult: ReceiptResult | null = null;
    if (amount > 0 && shouldIssueReceipt !== false) {
      const receiptPaymentId = childPayment ? childPayment.id : payment.id;
      const receiptAmount = childPayment ? amount : Number(payment.amount);
      const sessionRemaining = Number(payment.expectedAmount || 0) - Number(payment.amount);
      receiptResult = await issueReceipt({
        userId,
        paymentId: receiptPaymentId,
        amount: receiptAmount,
        clientName: client.name,
        clientEmail: client.email || undefined,
        clientPhone: client.phone || undefined,
        description: buildReceiptDescription(
          payment.session,
          sessionRemaining > 0,
          receiptAmount,
          Number(payment.expectedAmount || payment.amount)
        ),
        method,
      });
    }

    // Email — send only when there is an actual completed payment.
    // ⚠️ אסור לשלוח "התשלום בוצע" כש-status=PENDING (למשל בזרימת Cardcom שבה
    // קודם יוצרים שורה PENDING ורק אחרי webhook הופך ל-PAID). אחרת הלקוח
    // יקבל מייל מטעה לפני שבכלל שילם.
    if (amount > 0 && payment.status === "PAID") {
      const emailAmount = childPayment ? amount : Number(payment.amount);
      const sessionRemaining = Number(payment.expectedAmount || 0) - Number(payment.amount);
      await sendPaymentReceiptEmail({
        userId,
        clientId,
        amountPaid: emailAmount,
        expectedAmount: Number(payment.expectedAmount || payment.amount),
        method: payment.method,
        paidAt: payment.paidAt || new Date(),
        session: payment.session || null,
        receiptUrl: receiptResult?.receiptUrl || null,
        receiptNumber: receiptResult?.receiptNumber || null,
        sessionRemainingAfterPayment: Math.max(0, sessionRemaining),
      });
    }

    return {
      success: true,
      payment,
      childPayment,
      receiptNumber: receiptResult?.receiptNumber,
      receiptUrl: receiptResult?.receiptUrl,
      receiptError: receiptResult?.error,
    };
  } catch (error) {
    logger.error("createPaymentForSession error", { error: error instanceof Error ? error.message : String(error) });
    return {
      success: false,
      error: error instanceof Error ? error.message : "שגיאה ביצירת התשלום",
    };
  }
}

// ================================================================
// addPartialPayment
// ================================================================

export async function addPartialPayment(params: {
  userId: string;
  parentPaymentId: string;
  amount: number;
  method: PaymentMethod;
  issueReceipt?: boolean;
  creditUsed?: number;
}): Promise<PaymentResult> {
  try {
    const {
      userId,
      parentPaymentId,
      amount,
      method,
      issueReceipt: shouldIssueReceipt,
      creditUsed,
    } = params;

    const existingPayment = await prisma.payment.findFirst({
      where: { id: parentPaymentId, client: { therapistId: userId } },
      include: { client: true, session: true },
    });
    if (!existingPayment)
      return { success: false, error: "תשלום לא נמצא" };

    if (creditUsed && creditUsed > 0) {
      const cr = await deductCredit(existingPayment.clientId, creditUsed);
      if (!cr.success) return { success: false, error: cr.error };
    }

    const existingAmount = Number(existingPayment.amount);
    const expectedAmount = Number(existingPayment.expectedAmount) || 0;

    // Always create child for partial payments — clear audit trail
    const childPayment = await prisma.payment.create({
      data: {
        parentPaymentId,
        clientId: existingPayment.clientId,
        amount,
        expectedAmount: amount,
        method,
        status: "PAID",
        paidAt: new Date(),
        paymentType: "PARTIAL",
      },
    });

    const newTotal = existingAmount + amount;
    const finalStatus = newTotal >= expectedAmount ? "PAID" : "PENDING";

    const payment = await prisma.payment.update({
      where: { id: parentPaymentId },
      data: {
        amount: newTotal,
        status: finalStatus,
        method,
        paymentType: finalStatus === "PAID" ? "FULL" : "PARTIAL",
        paidAt: finalStatus === "PAID" ? new Date() : existingPayment.paidAt,
      },
      include: { client: true, session: true },
    });

    if (finalStatus === "PAID") {
      await prisma.task.updateMany({
        where: {
          userId,
          relatedEntityId: parentPaymentId,
          type: "COLLECT_PAYMENT",
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        data: { status: "COMPLETED" },
      });
    }

    // Receipt on child payment (default: issue unless explicitly disabled)
    let receiptResult: ReceiptResult | null = null;
    if (shouldIssueReceipt !== false) {
      const isStillPartial = newTotal < expectedAmount;
      receiptResult = await issueReceipt({
        userId,
        paymentId: childPayment.id,
        amount,
        clientName: existingPayment.client.name,
        clientEmail: existingPayment.client.email || undefined,
        clientPhone: existingPayment.client.phone || undefined,
        description: buildReceiptDescription(
          existingPayment.session,
          isStillPartial,
          amount,
          expectedAmount
        ),
        method,
      });
    }

    // Email for any paid amount
    if (amount > 0) {
      const sessionRemaining = Math.max(0, expectedAmount - newTotal);
      await sendPaymentReceiptEmail({
        userId,
        clientId: existingPayment.clientId,
        amountPaid: amount,
        expectedAmount: Number(payment.expectedAmount || payment.amount),
        method: payment.method,
        paidAt: payment.paidAt || new Date(),
        session: existingPayment.session || null,
        receiptUrl: receiptResult?.receiptUrl || null,
        receiptNumber: receiptResult?.receiptNumber || null,
        sessionRemainingAfterPayment: sessionRemaining,
      });
    }

    return {
      success: true,
      payment,
      childPayment,
      receiptNumber: receiptResult?.receiptNumber,
      receiptUrl: receiptResult?.receiptUrl,
      receiptError: receiptResult?.error,
    };
  } catch (error) {
    logger.error("addPartialPayment error", { error: error instanceof Error ? error.message : String(error) });
    return {
      success: false,
      error: error instanceof Error ? error.message : "שגיאה בהוספת תשלום חלקי",
    };
  }
}

// ================================================================
// markFullyPaid
// ================================================================

export async function markFullyPaid(params: {
  userId: string;
  paymentId: string;
  method: PaymentMethod;
  issueReceipt?: boolean;
  creditUsed?: number;
}): Promise<PaymentResult> {
  try {
    const { userId, paymentId, method, issueReceipt: shouldIssueReceipt, creditUsed } = params;

    const existingPayment = await prisma.payment.findFirst({
      where: { id: paymentId, client: { therapistId: userId } },
      include: { client: true, session: true },
    });
    if (!existingPayment)
      return { success: false, error: "תשלום לא נמצא" };

    if (creditUsed && creditUsed > 0) {
      const cr = await deductCredit(existingPayment.clientId, creditUsed);
      if (!cr.success) return { success: false, error: cr.error };
    }

    const existingAmount = Number(existingPayment.amount);
    const expectedAmount = Number(existingPayment.expectedAmount) || 0;
    const remaining = Math.max(0, expectedAmount - existingAmount);

    let childPayment = null;

    if (remaining > 0 && existingAmount > 0) {
      // Has partial history → record final installment as child
      childPayment = await prisma.payment.create({
        data: {
          parentPaymentId: paymentId,
          clientId: existingPayment.clientId,
          amount: remaining,
          expectedAmount: remaining,
          method,
          status: "PAID",
          paidAt: new Date(),
          paymentType: "FULL",
        },
      });
    }

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        amount: expectedAmount > 0 ? expectedAmount : existingAmount,
        status: "PAID",
        method,
        paymentType: "FULL",
        paidAt: new Date(),
      },
      include: { client: true, session: true },
    });

    await prisma.task.updateMany({
      where: {
        userId,
        relatedEntityId: paymentId,
        type: "COLLECT_PAYMENT",
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: { status: "COMPLETED" },
    });

    let receiptResult: ReceiptResult | null = null;
    if (shouldIssueReceipt !== false) {
      const receiptPaymentId = childPayment ? childPayment.id : paymentId;
      const receiptAmount = remaining > 0 ? remaining : expectedAmount || existingAmount;
      receiptResult = await issueReceipt({
        userId,
        paymentId: receiptPaymentId,
        amount: receiptAmount,
        clientName: existingPayment.client.name,
        clientEmail: existingPayment.client.email || undefined,
        clientPhone: existingPayment.client.phone || undefined,
        description: buildReceiptDescription(
          existingPayment.session,
          false,
          receiptAmount,
          expectedAmount
        ),
        method,
      });
    }

    const emailAmount = remaining > 0 ? remaining : expectedAmount || existingAmount;
    if (emailAmount > 0) {
      await sendPaymentReceiptEmail({
        userId,
        clientId: existingPayment.clientId,
        amountPaid: emailAmount,
        expectedAmount: Number(payment.expectedAmount || payment.amount),
        method: payment.method,
        paidAt: payment.paidAt || new Date(),
        session: existingPayment.session || null,
        receiptUrl: receiptResult?.receiptUrl || null,
        receiptNumber: receiptResult?.receiptNumber || null,
        sessionRemainingAfterPayment: 0,
      });
    }

    return {
      success: true,
      payment,
      childPayment,
      receiptNumber: receiptResult?.receiptNumber,
      receiptUrl: receiptResult?.receiptUrl,
      receiptError: receiptResult?.error,
    };
  } catch (error) {
    logger.error("markFullyPaid error", { error: error instanceof Error ? error.message : String(error) });
    return {
      success: false,
      error: error instanceof Error ? error.message : "שגיאה בסימון כשולם",
    };
  }
}
