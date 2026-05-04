import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import type { PaymentMethod, BulkPaymentResult, ClientDebtSummary, AllClientsDebtItem } from "./types";
import { issueReceipt, sendPaymentReceiptEmail, buildReceiptDescription } from "./receipt-service";
import { buildClientWhere, buildPaymentWhere, type ScopeUser } from "@/lib/scope";

// Re-export pure calculation helpers from payment-utils
export { calculateDebtFromPayments } from "@/lib/payment-utils";

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
  issueReceipt?: boolean;
  // Clinic multi-tenancy. אופציונלי לשמירה על תאימות. כשיש scopeUser
  // ownership נקבע דרך buildClientWhere ו-organizationId נכתב לתשלומים
  // החדשים שנוצרים בתוך ה-transaction.
  scopeUser?: ScopeUser;
  organizationId?: string | null;
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
      issueReceipt: shouldIssueReceipt = true,
      scopeUser,
      organizationId: explicitOrganizationId,
    } = params;

    const organizationId = scopeUser
      ? scopeUser.organizationId
      : explicitOrganizationId ?? null;

    const clientWhere = scopeUser
      ? { AND: [{ id: clientId }, buildClientWhere(scopeUser)] }
      : { id: clientId, therapistId: userId };

    const client = await prisma.client.findFirst({ where: clientWhere });
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
            organizationId: organizationId ?? payment.organizationId ?? null,
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

      // Credit deduction inside transaction (atomic check + decrement)
      if (creditUsed > 0) {
        const updated = await tx.client.updateMany({
          where: { id: clientId, creditBalance: { gte: creditUsed } },
          data: { creditBalance: { decrement: creditUsed } },
        });
        if (updated.count === 0) {
          const freshClient = await tx.client.findUnique({
            where: { id: clientId },
            select: { creditBalance: true },
          });
          throw new Error(
            `אין מספיק קרדיט. זמין: ₪${Number(
              freshClient?.creditBalance || 0
            ).toFixed(0)}, מבוקש: ₪${creditUsed.toFixed(0)}`
          );
        }
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

        // הוצאת קבלה - רק אם המשתמש ביקש
        let receiptUrl: string | null = null;
        let receiptNumber: string | null = null;
        if (shouldIssueReceipt !== false) {
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
          receiptUrl = receiptResult.receiptUrl;
          receiptNumber = receiptResult.receiptNumber;
        }

        // שליחת מייל - תמיד לפי הגדרות התקשורת של המשתמש
        const sessionRemaining = item.isFullyPaid ? 0 : Math.max(0, expAmt - Number(paymentWithSession.amount));
        await sendPaymentReceiptEmail({
          userId,
          clientId,
          amountPaid: item.amountPaid,
          expectedAmount: expAmt,
          method,
          paidAt: new Date(),
          session: paymentWithSession.session || null,
          receiptUrl,
          receiptNumber,
          sessionRemainingAfterPayment: sessionRemaining,
        });
      } catch (receiptEmailError) {
        logger.error("Error processing receipt/email for payment", {
          parentId: item.parentId,
          error: receiptEmailError instanceof Error ? receiptEmailError.message : String(receiptEmailError),
        });
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
    logger.error("processMultiSessionPayment error", { error: error instanceof Error ? error.message : String(error) });
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

// ================================================================
// Auto-fix stuck payments
// ================================================================

async function autoFixStuckPayments(
  userId: string,
  pendingPayments: Array<{ id: string; amount: unknown; expectedAmount: unknown; method?: string | null }>
): Promise<string[]> {
  const stuck = pendingPayments.filter((p) => {
    const paid = Number(p.amount);
    const expected = Number(p.expectedAmount) || 0;
    return (expected > 0 && paid >= expected) || (expected === 0 && paid > 0);
  });

  if (stuck.length === 0) return [];

  // CRITICAL guard — same protection as the daily fix-stuck-payments cron.
  // prepareCardcom flips a Payment to method=CREDIT_CARD with amount=expected
  // BEFORE Cardcom actually charges; promoting it to PAID here would mark
  // the row "paid" without any real charge. The Cardcom webhook is the only
  // source of truth for credit-card PAID transitions.
  const candidates = stuck.filter((p) => p.method !== "CREDIT_CARD");
  if (candidates.length === 0) return [];
  const candidateIds = candidates.map((p) => p.id);

  // Defense in depth — even non-CREDIT_CARD rows get blocked if there's
  // an in-flight Cardcom transaction on the same Payment.
  const blocking = await prisma.cardcomTransaction.findMany({
    where: {
      paymentId: { in: candidateIds },
      status: { in: ["PENDING", "APPROVED"] },
    },
    select: { paymentId: true },
  });
  const blockedSet = new Set(
    blocking.map((t) => t.paymentId).filter(Boolean) as string[]
  );
  const stuckIds = candidateIds.filter((id) => !blockedSet.has(id));
  if (stuckIds.length === 0) return [];

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
// getClientDebtSummary
// ================================================================

// אופציונלי `scopeUser`: כשמועבר, ownership עובר דרך buildClientWhere/
// buildPaymentWhere (תמיכה במזכירות/בעלי קליניקה). אחרת — ההתנהגות הישנה
// (סולו-מטפל בלבד) נשמרת כדי לא לשבור קוראים שטרם עברו.
export async function getClientDebtSummary(
  userId: string,
  clientId: string,
  scopeUser?: ScopeUser
): Promise<ClientDebtSummary | null> {
  const clientWhere = scopeUser
    ? buildClientWhere(scopeUser)
    : { therapistId: userId };
  const client = await prisma.client.findFirst({
    where: { AND: [{ id: clientId }, clientWhere] },
    select: { id: true, name: true, email: true, creditBalance: true },
  });
  if (!client) return null;

  // Scope-aware: כשיש scopeUser, החל את buildPaymentWhere כדי לכבד הרשאות
  // (למשל מזכירה ללא canViewPayments מקבלת deny). אחרת — סינון ישן לפי clientId.
  const pendingPaymentsWhere: Prisma.PaymentWhereInput = scopeUser
    ? {
        AND: [
          buildPaymentWhere(scopeUser),
          { clientId, status: "PENDING", parentPaymentId: null },
        ],
      }
    : { clientId, status: "PENDING", parentPaymentId: null };

  const allPending = await prisma.payment.findMany({
    where: pendingPaymentsWhere,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sessionId: true,
      createdAt: true,
      updatedAt: true,
      amount: true,
      expectedAmount: true,
      status: true,
      method: true,
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
// getAllClientsDebtSummary
// ================================================================

export async function getAllClientsDebtSummary(
  userId: string,
  scopeUser?: ScopeUser
): Promise<AllClientsDebtItem[]> {
  const clientWhere = scopeUser
    ? buildClientWhere(scopeUser)
    : { therapistId: userId };

  // Scope-aware: על המזכירה ללא canViewPayments — buildPaymentWhere מחזיר
  // { id: "__deny__" } שמסנן את כל ה-payments של הלקוח (לכן יוחזרו 0 חובות).
  // הסינון מוחל בתוך ה-nested include כדי לא לסבך את ה-where של ה-Client.
  const nestedPaymentsWhere: Prisma.PaymentWhereInput = scopeUser
    ? {
        AND: [
          buildPaymentWhere(scopeUser),
          { status: "PENDING", parentPaymentId: null },
        ],
      }
    : { status: "PENDING", parentPaymentId: null };

  const clients = await prisma.client.findMany({
    where: { AND: [clientWhere, { status: { not: "ARCHIVED" } }] },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      name: true,
      creditBalance: true,
      payments: {
        where: nestedPaymentsWhere,
        select: {
          id: true,
          amount: true,
          expectedAmount: true,
          createdAt: true,
          updatedAt: true,
          sessionId: true,
          method: true,
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
