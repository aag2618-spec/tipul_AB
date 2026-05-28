import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import type { PaymentMethod, BulkPaymentResult, ClientDebtSummary, AllClientsDebtItem } from "./types";
import { EXCLUDE_BULK_UMBRELLA_WHERE } from "./types";
import {
  issueReceipt,
  sendPaymentReceiptEmail,
  buildReceiptDescription,
  resolveCardcomReceiptOwner,
} from "./receipt-service";
import { buildClientWhere, buildPaymentWhere, type ScopeUser } from "@/lib/scope";
import { calculatePaidAmount } from "@/lib/payment-utils";
import { withAudit, type AuditActor } from "@/lib/audit";
import { applyRevenueShareSnapshot } from "@/lib/clinic/revenue-snapshot";

// M11.G3 (קומיט B): snapshot של חלק המטפל/ת בש"ח אחרי תשלום מצרפי. ה-helper
// בודק `session.organizationId` ומדלג לעצמאיים — תאימות מלאה לסולו.
// CRITICAL: עטוף ב-try-catch כדי שכשל ב-snapshot (DB / מוק חסר בבדיקות) לא
// יזרוק החוצה ויהפוך payment שהצליח ל-success:false. snapshot הוא תוסף
// חשבונאי — אסור לו לשבור את ה-flow הראשי.
async function snapshotForParentPayments(parentIds: string[]): Promise<void> {
  if (parentIds.length === 0) return;
  try {
    const parents = await prisma.payment.findMany({
      where: { id: { in: parentIds } },
      select: { sessionId: true },
    });
    for (const p of parents) {
      if (p.sessionId) {
        await applyRevenueShareSnapshot({ sessionId: p.sessionId });
      }
    }
  } catch (error) {
    logger.error("[bulk-payment] snapshotForParentPayments failed", {
      parentCount: parentIds.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

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

    // Phase 3 (H1 defense-in-depth): כשמועבר scopeUser — מצרים את ה-findMany
    // עם buildPaymentWhere. למזכירה ללא canViewPayments זה מחזיר
    // `{ id: "__deny__" }` ולכן הפילטר ב-AND לא ימצא רשומות (השרת מחזיר
    // "אין תשלומים ממתינים"). ה-route עצמו כבר מחזיר 403 לפני שמגיעים לכאן,
    // אבל הגנה כפולה — דפוס תואם getClientDebtSummary בקובץ הזה.
    const paymentScopeWhere: Prisma.PaymentWhereInput = scopeUser
      ? {
          AND: [
            buildPaymentWhere(scopeUser),
            { id: { in: paymentIds }, clientId, status: "PENDING" },
          ],
        }
      : { id: { in: paymentIds }, clientId, status: "PENDING" };

    // Transaction: create child payments + update parents + credit
    const result = await prisma.$transaction(async (tx) => {
      const pendingPayments = await tx.payment.findMany({
        where: paymentScopeWhere,
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

        // הוצאת קבלה - לפי המדיניות. כש-Cardcom primary: אילוץ הפקה תמיד
        // (זה החוק — Cardcom חייבת להפיק מסמך רשמי). אחרת: לפי checkbox.
        // resolveCardcomReceiptOwner מכליל את הפלבק לבעל הקליניקה — הכרחי
        // ל-bulk payment בקליניקה שבה רק ה-OWNER חיבר Cardcom.
        let receiptUrl: string | null = null;
        let receiptNumber: string | null = null;
        const cardcomReceiptOwner = await resolveCardcomReceiptOwner(
          userId,
          paymentWithSession.organizationId ?? null,
        );
        const effectiveIssueReceipt =
          !!cardcomReceiptOwner || shouldIssueReceipt !== false;
        if (effectiveIssueReceipt) {
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
          paymentId: paymentWithSession.id,
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

    await snapshotForParentPayments(result.processed.map((i) => i.parentId));

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
// distributeBulkCardcomPayment
// ================================================================
// נקרא מתוך webhook Cardcom אחרי APPROVED על umbrella Payment שנוצר ב-
// charge-cardcom-bulk. מטרה: לחלק את הסכום ששולם בפועל בין ה-Payments
// האמיתיים (children תחתם), ולשמר את הקבלה ב-umbrella (Cardcom יוצר קבלה
// אחת על totalAmount).
//
// קלט:
//   - umbrellaPaymentId: ה-Payment "המטה" שהcardcom-tx מצביע אליו (status=PAID).
//   - bulkPaymentIds: רשימת ה-Payments האמיתיים (parent payments) שצריך לסמן PAID.
//   - amountPaid: הסכום בפועל ש-Cardcom גבה (= umbrella.amount; webhook עדכן).
//
// הפלט: { processed: [{parentId, childId, amountPaid, isFullyPaid}], remaining }
//
// חשוב: הפונקציה הזאת רצה אחרי שה-umbrella כבר סומן PAID + נשמר ה-receiptUrl.
// היא רק מחלקת את הכסף ל-children. אם רץ פעמיים בטעות (idempotency), היא
// עוצרת אם ה-children כבר קיימים — לפי `cardcomTransactionId` שמסומן עליהם.

export async function distributeBulkCardcomPayment(params: {
  umbrellaPaymentId: string;
  bulkPaymentIds: string[];
  amountPaid: number;
  cardcomTransactionId: string;
}): Promise<{
  success: boolean;
  /** True כש-failure נובע מ-serialization conflict זמני (P2034/40001).
      ה-webhook יזרוק במקום AdminAlert כדי לאפשר ל-Cardcom retry. */
  transient?: boolean;
  processed: Array<{ parentId: string; childId: string; amountPaid: number; isFullyPaid: boolean }>;
  remainingAmount: number;
  error?: string;
}> {
  const { umbrellaPaymentId, bulkPaymentIds, amountPaid, cardcomTransactionId } = params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Idempotency guard בתוך SERIALIZABLE TX — webhook עלול להגיע פעמיים
      // (Cardcom retry). הבדיקה הקודמת רצה לפני ה-$transaction → race window
      // שני webhooks יכולים לראות `[]` ושניהם ליצור children = כפילות. עכשיו
      // הבדיקה נעולה: אם כבר יצרנו children עם reference ל-cardcomTransactionId
      // — נחזיר ריק. כל webhook שני שינסה לאחר שהראשון commit יראה את
      // ה-children הקיימים, וייצא בלי אפקט.
      const existingChildren = await tx.payment.findFirst({
        where: {
          parentPaymentId: { in: bulkPaymentIds },
          notes: { contains: cardcomTransactionId },
        },
        select: { id: true },
      });
      if (existingChildren) {
        logger.info("[distributeBulkCardcomPayment] already distributed — skipping", {
          umbrellaPaymentId,
          cardcomTransactionId,
        });
        return { processed: [], remainingAmount: 0, alreadyDistributed: true };
      }

      // קריאת ה-Umbrella לקבלת receipt info — Cardcom יוצר קבלה אחת על
      // הסכום הכולל וה-webhook/sync שומרים אותה על ה-umbrella. בלי לשכפל את
      // השדות לכל child, דף /dashboard/receipts מסנן את ה-Umbrella ע״י
      // EXCLUDE_BULK_UMBRELLA_WHERE → המטפלת לא רואה שום קבלה לתשלום מצרפי
      // למרות ש-Cardcom גבה את הכסף ויצר קבלה תקינה. זאת הצמדה משפטית
      // לגיטימית: הילדים מצביעים על אותו documentNumber של Cardcom (מקור
      // האמת), והמטפלת מקבלת שורה לכל פגישה בדף הקבלות.
      const umbrella = await tx.payment.findUnique({
        where: { id: umbrellaPaymentId },
        select: { hasReceipt: true, receiptNumber: true, receiptUrl: true },
      });

      // ל-children ננעל את ה-parents בסדר createdAt (oldest first) — כמו
      // ב-processMultiSessionPayment.
      const parents = await tx.payment.findMany({
        where: {
          id: { in: bulkPaymentIds },
          status: "PENDING",
          parentPaymentId: null,
        },
        orderBy: { createdAt: "asc" },
      });

      let remainingAmount = amountPaid;
      const processed: Array<{
        parentId: string;
        childId: string;
        amountPaid: number;
        isFullyPaid: boolean;
      }> = [];

      for (const parent of parents) {
        if (remainingAmount <= 0) break;

        const expAmt = Number(parent.expectedAmount) || 0;
        const currentAmt = Number(parent.amount);
        const debt = expAmt - currentAmt;
        if (debt <= 0) continue;

        const allocation = Math.min(remainingAmount, debt);
        const newTotal = currentAmt + allocation;
        const isFullyPaid = newTotal >= expAmt;

        const child = await tx.payment.create({
          data: {
            parentPaymentId: parent.id,
            clientId: parent.clientId,
            amount: allocation,
            expectedAmount: allocation,
            method: "CREDIT_CARD",
            status: "PAID",
            paidAt: new Date(),
            paymentType: "PARTIAL",
            organizationId: parent.organizationId,
            // Reference ל-CardcomTransaction מאפשר idempotency check
            // ומחבר את ה-child לחיוב המקורי לאודיט.
            notes: `Bulk Cardcom distribution — tx:${cardcomTransactionId}`,
            // Inherit receipt info from umbrella — הקבלה הרשמית של Cardcom
            // היא משותפת לכל ה-children. בלי זה הילדים נראים בלי קבלה
            // למרות שיש מסמך תקף (umbrella מסונן מתצוגות).
            ...(umbrella?.hasReceipt && umbrella.receiptNumber
              ? {
                  hasReceipt: true,
                  receiptNumber: umbrella.receiptNumber,
                  receiptUrl: umbrella.receiptUrl,
                }
              : {}),
          },
        });

        await tx.payment.update({
          where: { id: parent.id },
          data: {
            amount: newTotal,
            status: isFullyPaid ? "PAID" : "PENDING",
            method: "CREDIT_CARD",
            paymentType: isFullyPaid ? "FULL" : "PARTIAL",
            paidAt: isFullyPaid ? new Date() : undefined,
          },
        });

        processed.push({
          parentId: parent.id,
          childId: child.id,
          amountPaid: allocation,
          isFullyPaid,
        });

        remainingAmount -= allocation;
      }

      // השלמת COLLECT_PAYMENT tasks למטופלים שהושלמו.
      const fullyPaidIds = processed.filter((p) => p.isFullyPaid).map((p) => p.parentId);
      if (fullyPaidIds.length > 0) {
        await tx.task.updateMany({
          where: {
            relatedEntityId: { in: fullyPaidIds },
            type: "COLLECT_PAYMENT",
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
          data: { status: "COMPLETED" },
        });
      }

      return { processed, remainingAmount, alreadyDistributed: false };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    await snapshotForParentPayments(result.processed.map((i) => i.parentId));

    return {
      success: true,
      processed: result.processed,
      remainingAmount: result.remainingAmount,
    };
  } catch (error) {
    // טיפול נפרד ב-serialization conflicts (40001 / Prisma P2034) — שאלו הם
    // זמניים ויפתרו עם retry. אנחנו מסמנים `transient: true` כדי שה-webhook
    // יזרוק שגיאה במקום לפתוח AdminAlert, וכך Cardcom יבצע retry של ה-webhook.
    const code = (error as { code?: string })?.code;
    const message = error instanceof Error ? error.message : String(error);
    const isTransient =
      code === "P2034" ||
      code === "40001" ||
      message.includes("could not serialize") ||
      message.includes("deadlock");
    logger.error("[distributeBulkCardcomPayment] failed", {
      umbrellaPaymentId,
      cardcomTransactionId,
      transient: isTransient,
      error: message,
    });
    return {
      success: false,
      transient: isTransient,
      processed: [],
      remainingAmount: params.amountPaid,
      error: message || "שגיאה בחילוק תשלום מצרפי",
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

  await snapshotForParentPayments(stuckIds);

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
          EXCLUDE_BULK_UMBRELLA_WHERE,
          { clientId, status: "PENDING", parentPaymentId: null },
        ],
      }
    : { AND: [EXCLUDE_BULK_UMBRELLA_WHERE, { clientId, status: "PENDING", parentPaymentId: null }] };

  // ⭐ hasReceipt + childPayments — נדרשים ל-calculatePaidAmount כדי להבדיל
  // בין placeholder לסליקה ממתינה (CC + amount=expected, hasReceipt=false,
  // paidAmount=0) לבין אשראי חלקי שסולק (CC + amount=200, hasReceipt=true,
  // paidAmount=200) או השלמה דרך children PAID. ראה ההערה ב-payment-utils.
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
      hasReceipt: true,
      childPayments: {
        where: { status: "PAID" },
        select: { id: true, amount: true, status: true },
      },
    },
  });

  await autoFixStuckPayments(userId, allPending);

  // ⭐ paidAmount קנוני לכל תשלום — בלעדיו, חישוב חוב היה מסתמך על
  // payment.amount הגולמי שיכול להיות placeholder לסליקה ממתינה (CC).
  const enriched = allPending.map((p) => ({
    ...p,
    paidAmount: calculatePaidAmount(p),
  }));

  const unpaid = enriched.filter((p) => {
    const expected = Number(p.expectedAmount) || 0;
    return expected > 0 && p.paidAmount < expected;
  });

  const totalDebt = unpaid.reduce(
    (sum, p) => sum + (Number(p.expectedAmount) - p.paidAmount),
    0
  );

  return {
    id: client.id,
    name: client.name,
    email: client.email,
    creditBalance: Number(client.creditBalance),
    totalDebt,
    unpaidSessions: unpaid.map((p) => {
      const expectedAmount = Number(p.expectedAmount) || 0;
      return {
        paymentId: p.id,
        sessionId: p.sessionId,
        date: p.createdAt,
        amount: p.paidAmount,
        expectedAmount,
        paidAmount: p.paidAmount,
        status: p.status,
        partialPaymentDate:
          p.paidAmount > 0 && p.paidAmount < expectedAmount ? p.updatedAt : null,
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
          EXCLUDE_BULK_UMBRELLA_WHERE,
          { status: "PENDING", parentPaymentId: null },
        ],
      }
    : { AND: [EXCLUDE_BULK_UMBRELLA_WHERE, { status: "PENDING", parentPaymentId: null }] };

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
          status: true,
          hasReceipt: true,
          childPayments: {
            where: { status: "PAID" },
            select: { id: true, amount: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const allPending = clients.flatMap((c) => c.payments);
  await autoFixStuckPayments(userId, allPending);

  return clients
    .map((client) => {
      // ⭐ paidAmount קנוני (calculatePaidAmount) — מטפל באשראי חלקי שסולק
      // ובהשלמות דרך children PAID. בלעדיו, רשימת חובות בכרטיסי לקוחות
      // יכולה להציג חוב חלקי לתשלום שכבר התקבל בפועל.
      const unpaid = client.payments
        .map((p) => ({ ...p, _paid: calculatePaidAmount(p) }))
        .filter((p) => {
          const expected = Number(p.expectedAmount) || 0;
          return expected > 0 && p._paid < expected;
        })
        .map((p) => {
          const expectedAmount = Number(p.expectedAmount) || 0;
          return {
            paymentId: p.id,
            amount: expectedAmount,
            paidAmount: p._paid,
            date: p.createdAt,
            sessionId: p.sessionId,
            partialPaymentDate:
              p._paid > 0 && p._paid < expectedAmount ? p.updatedAt : null,
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

/**
 * round17 (B2): נדרש actor — הפעולה משנה receipt tokens (פעולה רגישה
 * חשבונאית, חייבת audit log). הקורא מעביר actor (user session ל-admin tool,
 * או system לscript ידני).
 */
export async function migrateParentReceiptsToChildren(
  actor: AuditActor
): Promise<{
  fixed: number;
  details: string[];
}> {
  // קריאה ראשונית מחוץ ל-tx (לא mutation). אם הרשימה גדולה — נחתוך לבאצ'ים
  // בעתיד; כרגע cron יומי, ספירה צפויה <50.
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

  if (parents.length === 0) {
    return { fixed: 0, details: [] };
  }

  // round17 (B2): עוטפים ב-withAudit — כל המוטציות (create+update) בתוך
  // אותו tx, plus audit row. atomicity מלאה.
  return await withAudit(
    actor,
    {
      action: "migrate_parent_receipts_to_children",
      targetType: "payment",
      details: {
        parentCount: parents.length,
        parentIds: parents.map((p) => p.id),
      },
    },
    async (tx) => {
      const details: string[] = [];

      for (const parent of parents) {
        const childSum = parent.childPayments.reduce(
          (s, c) => s + Number(c.amount),
          0
        );
        const originalAmount = Number(parent.amount) - childSum;
        if (originalAmount <= 0) continue;

        const newChild = await tx.payment.create({
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

        await tx.payment.update({
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
  );
}
