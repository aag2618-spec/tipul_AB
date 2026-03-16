import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { createPaymentReceiptEmail } from "@/lib/email-templates/payment-receipt";
import { createBillingService } from "@/lib/billing";
import { getReceiptPageUrl } from "@/lib/receipt-token";
import { mapPaymentMethod } from "@/lib/email-utils";
import { calculateDebtFromPayments } from "@/lib/payment-utils";

// ================================================================
// Types
// ================================================================

type PaymentMethod =
  | "CASH"
  | "CREDIT_CARD"
  | "BANK_TRANSFER"
  | "CHECK"
  | "CREDIT"
  | "OTHER";

type PaymentType = "FULL" | "PARTIAL" | "ADVANCE";

export interface PaymentResult {
  success: boolean;
  payment?: any;
  childPayment?: any;
  receiptNumber?: string | null;
  receiptUrl?: string | null;
  receiptError?: string;
  error?: string;
}

export interface BulkPaymentResult {
  success: boolean;
  updatedPayments: number;
  totalPaid: number;
  remainingAmount: number;
  message: string;
  error?: string;
}

interface ReceiptResult {
  receiptNumber: string | null;
  receiptUrl: string | null;
  hasReceipt: boolean;
  error?: string;
}

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

    console.error("Billing receipt creation failed:", result.error);
    return {
      receiptNumber: null,
      receiptUrl: null,
      hasReceipt: false,
      error: result.error || "שגיאה ביצירת קבלה בספק החיוב",
    };
  } catch (err) {
    console.error("Error creating receipt via billing provider:", err);
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
    console.error("Error sending payment receipt email:", err);
  }
}

// ================================================================
// Helpers
// ================================================================

function buildReceiptDescription(
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

async function deductCredit(
  clientId: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { creditBalance: true },
  });
  if (!client || Number(client.creditBalance) < amount) {
    return {
      success: false,
      error: `אין מספיק קרדיט. זמין: ₪${Number(
        client?.creditBalance || 0
      ).toFixed(0)}, מבוקש: ₪${amount.toFixed(0)}`,
    };
  }
  await prisma.client.update({
    where: { id: clientId },
    data: { creditBalance: { decrement: amount } },
  });
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
  status?: string;
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

    let payment;
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

    // Email — send for any actual payment
    if (amount > 0) {
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
    console.error("createPaymentForSession error:", error);
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
        paidAt: finalStatus === "PAID" ? new Date() : new Date(),
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
    console.error("addPartialPayment error:", error);
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
    console.error("markFullyPaid error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "שגיאה בסימון כשולם",
    };
  }
}

// ================================================================
// processMultiSessionPayment
// ================================================================

export async function processMultiSessionPayment(params: {
  userId: string;
  clientId: string;
  paymentIds: string[];
  totalAmount: number;
  method: PaymentMethod;
  paymentMode: "FULL" | "PARTIAL";
  creditUsed?: number;
}): Promise<BulkPaymentResult> {
  try {
    const {
      userId,
      clientId,
      paymentIds,
      totalAmount,
      method,
      paymentMode,
      creditUsed = 0,
    } = params;

    const client = await prisma.client.findFirst({
      where: { id: clientId, therapistId: userId },
    });
    if (!client) {
      return {
        success: false,
        updatedPayments: 0,
        totalPaid: 0,
        remainingAmount: totalAmount,
        message: "",
        error: "מטופל לא נמצא",
      };
    }

    // Transaction: create child payments + update parents + credit
    const result = await prisma.$transaction(async (tx) => {
      const pendingPayments = await tx.payment.findMany({
        where: { id: { in: paymentIds }, clientId, status: "PENDING" },
        orderBy: { createdAt: "asc" },
      });

      if (pendingPayments.length === 0) {
        throw new Error("אין תשלומים ממתינים");
      }

      let remainingAmount = totalAmount;
      const processed: Array<{
        parentId: string;
        childId: string;
        amountPaid: number;
        isFullyPaid: boolean;
      }> = [];

      for (const payment of pendingPayments) {
        if (remainingAmount <= 0) break;

        const expAmt = Number(payment.expectedAmount) || 0;
        const currentAmt = Number(payment.amount);
        const debt = expAmt - currentAmt;
        if (debt <= 0) continue;

        const allocation = Math.min(remainingAmount, debt);
        const newTotal = currentAmt + allocation;
        const isFullyPaid = newTotal >= expAmt;

        // Create child payment — THE KEY FIX
        const child = await tx.payment.create({
          data: {
            parentPaymentId: payment.id,
            clientId,
            amount: allocation,
            expectedAmount: allocation,
            method,
            status: "PAID",
            paidAt: new Date(),
            paymentType: "PARTIAL",
          },
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            amount: newTotal,
            status: isFullyPaid ? "PAID" : "PENDING",
            method,
            paymentType: isFullyPaid ? "FULL" : "PARTIAL",
            paidAt: isFullyPaid ? new Date() : undefined,
          },
        });

        processed.push({
          parentId: payment.id,
          childId: child.id,
          amountPaid: allocation,
          isFullyPaid,
        });

        remainingAmount -= allocation;
      }

      if (paymentMode === "FULL" && remainingAmount > 0.001) {
        console.warn(
          `Warning: Full payment had remaining amount: ${remainingAmount}`
        );
      }

      // Credit deduction inside transaction
      if (creditUsed > 0) {
        const currentCredit = Number(client.creditBalance);
        if (currentCredit < creditUsed) {
          throw new Error(
            `אין מספיק קרדיט. זמין: ₪${currentCredit.toFixed(
              0
            )}, מבוקש: ₪${creditUsed.toFixed(0)}`
          );
        }
        await tx.client.update({
          where: { id: clientId },
          data: { creditBalance: currentCredit - creditUsed },
        });
      }

      return {
        processed,
        totalPaid: totalAmount - remainingAmount,
        remainingAmount,
      };
    });

    // After transaction: receipts + emails for each processed payment
    for (const item of result.processed) {
      if (item.amountPaid <= 0) continue;

      try {
        const paymentWithSession = await prisma.payment.findUnique({
          where: { id: item.parentId },
          include: { session: true },
        });
        if (!paymentWithSession) continue;

        const expAmt = Number(paymentWithSession.expectedAmount) || 0;
        const isStillPartial = !item.isFullyPaid;

        const receiptResult = await issueReceipt({
          userId,
          paymentId: item.childId,
          amount: item.amountPaid,
          clientName: client.name,
          clientEmail: client.email || undefined,
          clientPhone: client.phone || undefined,
          description: buildReceiptDescription(
            paymentWithSession.session,
            isStillPartial,
            item.amountPaid,
            expAmt
          ),
          method,
        });

        const sessionRemaining = item.isFullyPaid ? 0 : Math.max(0, expAmt - Number(paymentWithSession.amount));
        await sendPaymentReceiptEmail({
          userId,
          clientId,
          amountPaid: item.amountPaid,
          expectedAmount: expAmt,
          method,
          paidAt: new Date(),
          session: paymentWithSession.session || null,
          receiptUrl: receiptResult.receiptUrl,
          receiptNumber: receiptResult.receiptNumber,
          sessionRemainingAfterPayment: sessionRemaining,
        });
      } catch (receiptEmailError) {
        console.error(
          "Error processing receipt/email for payment:",
          item.parentId,
          receiptEmailError
        );
      }
    }

    // Complete collection tasks for fully-paid payments
    for (const item of result.processed) {
      if (item.isFullyPaid) {
        await prisma.task.updateMany({
          where: {
            userId,
            relatedEntityId: item.parentId,
            type: "COLLECT_PAYMENT",
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
          data: { status: "COMPLETED" },
        });
      }
    }

    const message =
      paymentMode === "PARTIAL"
        ? `תשלום חלקי של ₪${totalAmount} בוצע בהצלחה`
        : "כל החובות שולמו בהצלחה";

    return {
      success: true,
      updatedPayments: result.processed.length,
      totalPaid: result.totalPaid,
      remainingAmount: result.remainingAmount,
      message,
    };
  } catch (error) {
    console.error("processMultiSessionPayment error:", error);
    return {
      success: false,
      updatedPayments: 0,
      totalPaid: 0,
      remainingAmount: params.totalAmount,
      message: "",
      error: error instanceof Error ? error.message : "שגיאה בעיבוד התשלום",
    };
  }
}

// Re-export pure calculation helpers from payment-utils
export { calculateDebtFromPayments } from "@/lib/payment-utils";

// ================================================================
// READ: Auto-fix stuck payments
// ================================================================

async function autoFixStuckPayments(
  userId: string,
  pendingPayments: Array<{ id: string; amount: any; expectedAmount: any }>
): Promise<string[]> {
  const stuck = pendingPayments.filter((p) => {
    const paid = Number(p.amount);
    const expected = Number(p.expectedAmount) || 0;
    return (expected > 0 && paid >= expected) || (expected === 0 && paid > 0);
  });

  if (stuck.length === 0) return [];

  const stuckIds = stuck.map((p) => p.id);
  await prisma.payment.updateMany({
    where: { id: { in: stuckIds } },
    data: { status: "PAID", paidAt: new Date() },
  });
  await prisma.task.updateMany({
    where: {
      userId,
      relatedEntityId: { in: stuckIds },
      type: "COLLECT_PAYMENT",
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    data: { status: "COMPLETED" },
  });

  return stuckIds;
}

// ================================================================
// READ: getClientDebtSummary
// ================================================================

export interface ClientDebtSummary {
  id: string;
  name: string;
  email?: string | null;
  creditBalance: number;
  totalDebt: number;
  unpaidSessions: Array<{
    paymentId: string;
    sessionId: string | null;
    date: Date;
    amount: number;
    expectedAmount: number;
    paidAmount: number;
    status: string;
    partialPaymentDate?: Date | null;
  }>;
}

export async function getClientDebtSummary(
  userId: string,
  clientId: string
): Promise<ClientDebtSummary | null> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, therapistId: userId },
    select: { id: true, name: true, email: true, creditBalance: true },
  });
  if (!client) return null;

  const allPending = await prisma.payment.findMany({
    where: { clientId, status: "PENDING", parentPaymentId: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sessionId: true,
      createdAt: true,
      updatedAt: true,
      amount: true,
      expectedAmount: true,
      status: true,
    },
  });

  await autoFixStuckPayments(userId, allPending);

  const unpaid = allPending.filter((p) => {
    const paid = Number(p.amount);
    const expected = Number(p.expectedAmount) || 0;
    return expected > 0 && paid < expected;
  });

  const totalDebt = unpaid.reduce(
    (sum, p) => sum + (Number(p.expectedAmount) - Number(p.amount)),
    0
  );

  return {
    id: client.id,
    name: client.name,
    email: client.email,
    creditBalance: Number(client.creditBalance),
    totalDebt,
    unpaidSessions: unpaid.map((p) => {
      const paidAmount = Number(p.amount);
      const expectedAmount = Number(p.expectedAmount) || 0;
      return {
        paymentId: p.id,
        sessionId: p.sessionId,
        date: p.createdAt,
        amount: paidAmount,
        expectedAmount,
        paidAmount,
        status: p.status,
        partialPaymentDate:
          paidAmount > 0 && paidAmount < expectedAmount ? p.updatedAt : null,
      };
    }),
  };
}

// ================================================================
// READ: getAllClientsDebtSummary
// ================================================================

export interface AllClientsDebtItem {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  totalDebt: number;
  creditBalance: number;
  unpaidSessionsCount: number;
  unpaidSessions: Array<{
    paymentId: string;
    amount: number;
    paidAmount: number;
    date: Date;
    sessionId: string | null;
    partialPaymentDate: Date | null;
  }>;
}

export async function getAllClientsDebtSummary(
  userId: string
): Promise<AllClientsDebtItem[]> {
  const clients = await prisma.client.findMany({
    where: { therapistId: userId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      name: true,
      creditBalance: true,
      payments: {
        where: { status: "PENDING", parentPaymentId: null },
        select: {
          id: true,
          amount: true,
          expectedAmount: true,
          createdAt: true,
          updatedAt: true,
          sessionId: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const allPending = clients.flatMap((c) => c.payments);
  await autoFixStuckPayments(userId, allPending);

  return clients
    .map((client) => {
      const unpaid = client.payments
        .filter((p) => {
          const paid = Number(p.amount);
          const expected = Number(p.expectedAmount) || 0;
          return expected > 0 && paid < expected;
        })
        .map((p) => {
          const paidAmount = Number(p.amount);
          const expectedAmount = Number(p.expectedAmount) || 0;
          return {
            paymentId: p.id,
            amount: expectedAmount,
            paidAmount,
            date: p.createdAt,
            sessionId: p.sessionId,
            partialPaymentDate:
              paidAmount > 0 && paidAmount < expectedAmount
                ? p.updatedAt
                : null,
          };
        });

      const totalDebt = unpaid.reduce(
        (sum, s) => sum + (s.amount - s.paidAmount),
        0
      );

      return {
        id: client.id,
        firstName: client.firstName || "",
        lastName: client.lastName || "",
        fullName:
          client.firstName && client.lastName
            ? `${client.firstName} ${client.lastName}`
            : client.name,
        totalDebt,
        creditBalance: Number(client.creditBalance),
        unpaidSessionsCount: unpaid.length,
        unpaidSessions: unpaid,
      };
    })
    .filter((c) => c.totalDebt > 0 || c.creditBalance > 0);
}

// ================================================================
// migrateParentReceiptsToChildren
// ================================================================

export async function migrateParentReceiptsToChildren(): Promise<{
  fixed: number;
  details: string[];
}> {
  const parents = await prisma.payment.findMany({
    where: {
      hasReceipt: true,
      parentPaymentId: null,
      childPayments: { some: {} },
    },
    include: {
      childPayments: { select: { id: true, amount: true } },
      client: { select: { name: true } },
    },
  });

  const details: string[] = [];

  for (const parent of parents) {
    const childSum = parent.childPayments.reduce(
      (s, c) => s + Number(c.amount),
      0
    );
    const originalAmount = Number(parent.amount) - childSum;
    if (originalAmount <= 0) continue;

    const newChild = await prisma.payment.create({
      data: {
        parentPaymentId: parent.id,
        clientId: parent.clientId,
        amount: originalAmount,
        expectedAmount: originalAmount,
        method: parent.method,
        status: "PAID",
        paidAt: parent.createdAt,
        paymentType: "PARTIAL",
        receiptNumber: parent.receiptNumber,
        receiptUrl: parent.receiptUrl,
        hasReceipt: true,
      },
    });

    await prisma.payment.update({
      where: { id: parent.id },
      data: {
        hasReceipt: false,
        receiptNumber: null,
        receiptUrl: null,
      },
    });

    details.push(
      `${parent.client.name}: moved receipt ${parent.receiptNumber} ` +
        `(₪${originalAmount}) from parent ${parent.id} to child ${newChild.id}`
    );
  }

  return { fixed: details.length, details };
}
