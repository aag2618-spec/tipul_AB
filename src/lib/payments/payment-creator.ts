import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

// ──────────────────────────────────────────────────────────────────
// withSerializableRetry — עוטף קריאת DB ב-Serializable עם retry על
// כשלי serialization (P2034 / 40001). חיוני לזרמים שקוראים-ואז-כותבים
// על אותה שורת parent (כמו addPartialPayment), כדי למנוע lost updates
// כששתי קריאות מקבילות מעדכנות את `parent.amount`.
// ──────────────────────────────────────────────────────────────────
async function withSerializableRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  max = 5,
): Promise<T> {
  for (let attempt = 0; attempt < max; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === "P2034" || e.code === "40001")
      ) {
        if (attempt === max - 1) throw e;
        await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error("withSerializableRetry: unreachable");
}
import type { PaymentMethod, PaymentType, PaymentResult, PaymentStatus, ReceiptResult } from "./types";
import {
  issueReceipt,
  sendPaymentReceiptEmail,
  buildReceiptDescription,
} from "./receipt-service";
import { buildClientWhere, buildPaymentWhere, type ScopeUser } from "@/lib/scope";
import { applyRevenueShareSnapshot } from "@/lib/clinic/revenue-snapshot";

// M11.G3 (קומיט B): snapshot של חלק המטפל/ת בש"ח אחרי כל update ל-Payment.
// ה-helper פנימי מסונן: (א) מדלג אוטומטית למטפל/ת עצמאי/ת
// (organizationId=null) — תאימות מלאה לזרימת הסולו; (ב) מדלג אם אין totalPaid
// (לא נגרם snapshot על אפס). הקריאה ב-try-catch של ה-helper עצמו, ולעולם לא
// זורקת ולא תשבור payment flow. נקראת גם על PENDING (כש-child PAID קיים)
// וגם על PAID של ה-parent — ה-helper יודע לסכם את כל ה-PAID children.
function snapshotSessionIfAny(payment: {
  session?: { id: string } | null;
}): Promise<void> {
  if (!payment.session?.id) return Promise.resolve();
  return applyRevenueShareSnapshot({ sessionId: payment.session.id });
}

// ──────────────────────────────────────────────────────────────────
// resolveIssueReceipt — מדיניות אחידה לכל המשתמשים (החלטת מוצר 2026-06-25):
//   • תשלום שאינו עובר בקארדקום (מזומן/העברה/צ'ק/אשראי-ידני) ⇒ לפי בחירת
//     המשתמש (ה-checkbox / receiptDefaultMode). undefined = true (תאימות
//     לאחור — זרימות שלא מעבירות את השדה מקבלות קבלה כברירת מחדל).
//   • תשלום אשראי דרך קארדקום אינו מגיע לכאן: הקבלה מופקת אוטומטית בסליקה
//     (ה-webhook), ו-createPaymentForSession מדלג דרך isCardcomPendingFlow.
//
// אין יותר כפיית קבלה לפי סוג עסק/ספק — כל מטפל/ת בוחר/ת במזומן, בכל סוג
// עסק. (עוסק מורשה מחויב חוקית בקבלה על כל תקבול — האחריות עליו, לא המערכת.)
// ──────────────────────────────────────────────────────────────────
function resolveIssueReceipt(shouldIssueReceipt: boolean | undefined): boolean {
  return shouldIssueReceipt !== false;
}

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
  // Clinic multi-tenancy. אופציונלי לשמירה על תאימות עם callers ישנים שעדיין
  // לא נדרש לעדכן (TODO(scope) — agent-coordinated migration). כשיש
  // scopeUser, ownership נקבע דרך buildClientWhere ו-organizationId נכתב
  // ל-Payment החדש; אחרת נשמרת התנהגות הסולו-מטפל הישנה.
  scopeUser?: ScopeUser;
  organizationId?: string | null;
}): Promise<PaymentResult> {
  // ⚠️ creditDeducted מוצהר מחוץ ל-try כדי שה-catch יוכל לבצע rollback.
  let creditDeducted = 0;
  let clientId = "";
  try {
    const {
      userId,
      clientId: clientIdParam,
      sessionId,
      amount,
      expectedAmount,
      method,
      paymentType,
      status: requestedStatus,
      issueReceipt: shouldIssueReceipt,
      notes,
      creditUsed,
      scopeUser,
      organizationId: explicitOrganizationId,
    } = params;

    clientId = clientIdParam;

    const organizationId = scopeUser
      ? scopeUser.organizationId
      : explicitOrganizationId ?? null;

    const clientWhere = scopeUser
      ? { AND: [{ id: clientId }, buildClientWhere(scopeUser)] }
      : { id: clientId, therapistId: userId };

    const client = await prisma.client.findFirst({ where: clientWhere });
    if (!client) return { success: false, error: "מטופל לא נמצא" };

    // Credit deduction
    // ⚠️ זוהי הפחתה לפני יצירת ה-Payment בפועל. אם משהו אחרי הנקודה הזו
    // יזרוק (DB / Cardcom / לוגיקה), הקרדיט נחתך מהלקוח אבל שום Payment
    // לא נוצר. במקום זאת — עוקבים ב-`creditDeducted` ובמקרה כשל ב-catch
    // אנו מחזירים את הקרדיט (best-effort rollback).
    if (creditUsed && creditUsed > 0) {
      const cr = await deductCredit(clientId, creditUsed);
      if (!cr.success) return { success: false, error: cr.error };
      creditDeducted = creditUsed;
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

      // ── תשלום באשראי על partial קיים → child PENDING, parent untouched ──
      // ה-Cardcom webhook יסמן את ה-child PAID + יעדכן את ה-parent דרך
      // bumpParentOnChildApproval. עד אז: parent.amount נשאר על העבר,
      // child PENDING מסמן את החיוב המתוכנן.
      if (
        existingAmount > 0 &&
        method === "CREDIT_CARD" &&
        requestedStatus === "PENDING"
      ) {
        childPayment = await prisma.payment.create({
          data: {
            parentPaymentId: existingPayment.id,
            clientId,
            amount,
            expectedAmount: amount,
            method: "CREDIT_CARD",
            status: "PENDING",
            paymentType: "PARTIAL",
            notes: notes || null,
            organizationId,
          },
        });
        // החזרת ה-child כ-"payment" כדי שה-caller (update-session-dialog)
        // יפתח את ChargeCardcomDialog עם ה-child.id (הוא זה שייכנס לסליקה).
        payment = (await prisma.payment.findUnique({
          where: { id: childPayment.id },
          include: { client: true, session: true },
        }))!;
        // אין child notification, אין email — ה-webhook ינהל את כל זה.
        return {
          success: true,
          payment,
          childPayment: null,
          receiptNumber: undefined,
          receiptUrl: undefined,
        };
      }

      if (existingAmount === 0) {
        // First actual payment on a zero-amount debt record — update directly.
        // הענף תופס גם FULL וגם PARTIAL כש-amount=0 (טרם נצברו תשלומים).
        // יצירת child PAID במצב כזה היא טעות — אין סיבה לפצל בעוד שאפשר
        // פשוט להגדיר את ה-parent.
        // CRITICAL: בזרימת Cardcom המבקש שולח status="PENDING" כי הסליקה עדיין
        // לא בוצעה — ה-webhook יעדכן ל-PAID אחרי חיוב אמיתי. אם ניגזור PAID
        // מהשוואת amount==expected, נסמן את החוב כשולם בלי שום סליקה אמיתית.
        const finalStatus =
          requestedStatus || (amount >= expAmt ? "PAID" : "PENDING");
        const finalPaymentType =
          paymentType === "PARTIAL" || amount < expAmt - 0.001
            ? "PARTIAL"
            : paymentType;
        payment = await prisma.payment.update({
          where: { sessionId: sessionId! },
          data: {
            amount,
            expectedAmount: expAmt,
            paymentType: finalPaymentType,
            method,
            status: finalStatus,
            paidAt: finalStatus === "PAID" ? new Date() : null,
            notes: notes || null,
          },
          include: { client: true, session: true },
        });
      } else {
        // Has existing amount → create child + update parent atomically.
        // ⚠️ Serializable + retry: בלי זה, שתי קריאות מקבילות יקראו אותו
        // existingAmount ויכתבו amount שגוי (lost-update). מקביל בדיוק
        // ל-addPartialPayment.
        const txResult = await withSerializableRetry(async (tx) => {
          const freshParent = await tx.payment.findUnique({
            where: { id: existingPayment.id },
            include: { client: true, session: true },
          });
          if (!freshParent) {
            throw new Error("PARENT_DISAPPEARED");
          }
          const freshExisting = Number(freshParent.amount);
          const freshExpected = Number(freshParent.expectedAmount) || expectedAmount;

          const child = await tx.payment.create({
            data: {
              parentPaymentId: freshParent.id,
              clientId,
              amount,
              expectedAmount: amount,
              method,
              status: "PAID",
              paidAt: new Date(),
              paymentType: "PARTIAL",
              organizationId,
            },
          });
          const newTotal = freshExisting + amount;
          const finalStatus = newTotal >= freshExpected ? "PAID" : "PENDING";
          const updated = await tx.payment.update({
            where: { id: freshParent.id },
            data: {
              amount: newTotal,
              status: finalStatus,
              paymentType: finalStatus === "PAID" ? "FULL" : "PARTIAL",
              paidAt:
                finalStatus === "PAID" ? new Date() : freshParent.paidAt,
            },
            include: { client: true, session: true },
          });
          return { child, updated };
        });
        childPayment = txResult.child;
        payment = txResult.updated;
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
          organizationId,
        },
        include: { client: true, session: true },
      });

      if (isFirstPartial) {
        // עבור CC PENDING (טרם סלק) — לא יוצרים child PAID זמני, כי
        // ה-webhook לא מצפה לו ולא יעדכן אותו. ה-status של ה-parent יישאר
        // PENDING; ה-webhook יחזיר PAID/PENDING לפי amount>=expectedAmount.
        // עבור מזומן/בנק/צ'ק — יוצרים child PAID כרגיל (audit trail).
        const isCardcomPending =
          method === "CREDIT_CARD" && derivedStatus === "PENDING";
        if (!isCardcomPending) {
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
              organizationId,
            },
          });
        }
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

    // Receipt — issue for any actual payment (not just when parent is PAID).
    // resolveIssueReceipt מכבד את בחירת המשתמש (issueReceipt) — אין יותר כפיית
    // קבלה לפי ספק/סוג עסק (מדיניות אחידה 2026-06-25; אשראי מטופל בנפרד למטה).
    //
    // EXCEPTION: כש-method=CREDIT_CARD + status=PENDING — לא להפיק כעת.
    // ה-LowProfile של Cardcom יפיק Document אוטומטית בעת אישור הסליקה
    // (דרך ה-webhook). הפקה נוספת כאן תיצור 2 מסמכים.
    const isCardcomPendingFlow =
      method === "CREDIT_CARD" && payment.status === "PENDING";
    const effectiveIssueReceipt =
      !isCardcomPendingFlow && resolveIssueReceipt(shouldIssueReceipt);
    let receiptResult: ReceiptResult | null = null;
    if (amount > 0 && effectiveIssueReceipt) {
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
        paymentId: payment.id,
      });
    }

    await snapshotSessionIfAny(payment);

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
    // ⚠️ best-effort rollback של קרדיט שהוחתך לפני שהתרחש כשל. המשתנה
    // creditDeducted מוגדר רק אם הצלחנו להפחית. בכשל החזרה — לוגים בלבד,
    // לא לזרוק (אנו כבר ב-catch הראשי וחייבים להחזיר תשובת שגיאה ללקוח).
    if (creditDeducted > 0) {
      try {
        await prisma.client.update({
          where: { id: clientId },
          data: { creditBalance: { increment: creditDeducted } },
        });
        logger.info("[createPaymentForSession] credit refunded after failure", {
          clientId,
          creditDeducted,
        });
      } catch (refundErr) {
        logger.error("[createPaymentForSession] CRITICAL: credit deducted but refund failed", {
          clientId,
          creditDeducted,
          originalError: error instanceof Error ? error.message : String(error),
          refundError: refundErr instanceof Error ? refundErr.message : String(refundErr),
        });
      }
    }
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
  scopeUser?: ScopeUser;
  organizationId?: string | null;
}): Promise<PaymentResult> {
  try {
    const {
      userId,
      parentPaymentId,
      amount,
      method,
      issueReceipt: shouldIssueReceipt,
      creditUsed,
      scopeUser,
      organizationId: explicitOrganizationId,
    } = params;

    const organizationId = scopeUser
      ? scopeUser.organizationId
      : explicitOrganizationId ?? null;

    const paymentWhere = scopeUser
      ? { AND: [{ id: parentPaymentId }, buildPaymentWhere(scopeUser)] }
      : { id: parentPaymentId, client: { therapistId: userId } };

    // ⚠️ Serializable + retry: קריאת parent + יצירת child + עדכון
    // parent.amount = existingAmount + amount חייבים להיות אטומיים.
    // בלי זה, שני addPartialPayment מקבילים יקראו את אותו existingAmount
    // ויכתבו amount שגוי (lost update).
    let result;
    try {
      result = await withSerializableRetry(async (tx) => {
        const existingPayment = await tx.payment.findFirst({
          where: paymentWhere,
          include: { client: true, session: true },
        });
        if (!existingPayment) {
          return { kind: "not_found" as const };
        }

        const existingAmount = Number(existingPayment.amount);
        const expectedAmount = Number(existingPayment.expectedAmount) || 0;

        const childPayment = await tx.payment.create({
          data: {
            parentPaymentId,
            clientId: existingPayment.clientId,
            amount,
            expectedAmount: amount,
            method,
            status: "PAID",
            paidAt: new Date(),
            paymentType: "PARTIAL",
            organizationId: organizationId ?? existingPayment.organizationId ?? null,
          },
        });

        const newTotal = existingAmount + amount;
        const finalStatus = newTotal >= expectedAmount ? "PAID" : "PENDING";

        const updatedParent = await tx.payment.update({
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
          await tx.task.updateMany({
            where: {
              userId,
              relatedEntityId: parentPaymentId,
              type: "COLLECT_PAYMENT",
              status: { in: ["PENDING", "IN_PROGRESS"] },
            },
            data: { status: "COMPLETED" },
          });
        }

        return {
          kind: "ok" as const,
          existingPayment,
          childPayment,
          payment: updatedParent,
          existingAmount,
          expectedAmount,
          newTotal,
          finalStatus,
        };
      });
    } catch (e) {
      logger.error("[addPartialPayment] serializable transaction failed", {
        parentPaymentId,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }

    if (result.kind === "not_found") {
      return { success: false, error: "תשלום לא נמצא" };
    }

    const { existingPayment, childPayment, payment, expectedAmount, newTotal, finalStatus } =
      result;

    // ⚠️ deductCredit אחרי הטרנזקציה — אם נכשל, נחזיר rollback ידני
    // ע"י ביטול ה-child שיצרנו. זה לא מושלם אטומית (שני TX), אבל עדיף
    // על ניסיון להריץ את deductCredit בתוך Serializable שיכביד מאוד
    // את הסיכוי לקונפליקטים על שורת ה-Client.
    if (creditUsed && creditUsed > 0) {
      const cr = await deductCredit(existingPayment.clientId, creditUsed);
      if (!cr.success) {
        try {
          await prisma.payment.delete({ where: { id: childPayment.id } });
          await prisma.payment.update({
            where: { id: parentPaymentId },
            data: {
              amount: Number(existingPayment.amount),
              status: existingPayment.status,
              paymentType: existingPayment.paymentType,
              method: existingPayment.method,
              paidAt: existingPayment.paidAt,
            },
          });
        } catch (rollbackErr) {
          logger.error("[addPartialPayment] credit deduct failed and rollback failed", {
            parentPaymentId,
            childId: childPayment.id,
            error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
          });
        }
        return { success: false, error: cr.error };
      }
    }

    // Receipt on child payment — לפי בחירת המשתמש (מדיניות אחידה).
    const effectiveIssueReceipt = resolveIssueReceipt(shouldIssueReceipt);
    let receiptResult: ReceiptResult | null = null;
    if (effectiveIssueReceipt) {
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
        paymentId: payment.id,
      });
    }

    await snapshotSessionIfAny(payment);

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
  scopeUser?: ScopeUser;
  organizationId?: string | null;
}): Promise<PaymentResult> {
  try {
    const {
      userId,
      paymentId,
      method,
      issueReceipt: shouldIssueReceipt,
      creditUsed,
      scopeUser,
      organizationId: explicitOrganizationId,
    } = params;

    const organizationId = scopeUser
      ? scopeUser.organizationId
      : explicitOrganizationId ?? null;

    const paymentWhere = scopeUser
      ? { AND: [{ id: paymentId }, buildPaymentWhere(scopeUser)] }
      : { id: paymentId, client: { therapistId: userId } };

    // ⚠️ Serializable + retry: read existingPayment, create child (אם צריך),
    // update parent — באטומיות. בלי זה: שני markFullyPaid מקבילים יוצרים
    // 2 children (כל אחד עם remaining מלא לפי snapshot ישן) ועדכון parent
    // לא עקבי. Identical race-class ל-addPartialPayment.
    let result;
    try {
      result = await withSerializableRetry(async (tx) => {
        const existingPayment = await tx.payment.findFirst({
          where: paymentWhere,
          include: { client: true, session: true },
        });
        if (!existingPayment) {
          return { kind: "not_found" as const };
        }

        const existingAmount = Number(existingPayment.amount);
        const expectedAmount = Number(existingPayment.expectedAmount) || 0;
        const remaining = Math.max(0, expectedAmount - existingAmount);

        let childPayment = null;
        if (remaining > 0 && existingAmount > 0) {
          childPayment = await tx.payment.create({
            data: {
              parentPaymentId: paymentId,
              clientId: existingPayment.clientId,
              amount: remaining,
              expectedAmount: remaining,
              method,
              status: "PAID",
              paidAt: new Date(),
              paymentType: "FULL",
              organizationId: organizationId ?? existingPayment.organizationId ?? null,
            },
          });
        }

        const payment = await tx.payment.update({
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

        await tx.task.updateMany({
          where: {
            userId,
            relatedEntityId: paymentId,
            type: "COLLECT_PAYMENT",
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
          data: { status: "COMPLETED" },
        });

        return {
          kind: "ok" as const,
          existingPayment,
          childPayment,
          payment,
          existingAmount,
          expectedAmount,
          remaining,
        };
      });
    } catch (e) {
      logger.error("[markFullyPaid] serializable transaction failed", {
        paymentId,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }

    if (result.kind === "not_found") {
      return { success: false, error: "תשלום לא נמצא" };
    }
    const { existingPayment, childPayment, payment, existingAmount, expectedAmount, remaining } =
      result;

    // deductCredit אחרי tx (כמו ב-addPartialPayment) — עם rollback ידני אם נכשל.
    if (creditUsed && creditUsed > 0) {
      const cr = await deductCredit(existingPayment.clientId, creditUsed);
      if (!cr.success) {
        try {
          if (childPayment) {
            await prisma.payment.delete({ where: { id: childPayment.id } });
          }
          await prisma.payment.update({
            where: { id: paymentId },
            data: {
              amount: Number(existingPayment.amount),
              status: existingPayment.status,
              paymentType: existingPayment.paymentType,
              method: existingPayment.method,
              paidAt: existingPayment.paidAt,
            },
          });
        } catch (rollbackErr) {
          logger.error("[markFullyPaid] credit deduct failed and rollback failed", {
            paymentId,
            error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
          });
        }
        return { success: false, error: cr.error };
      }
    }

    const effectiveIssueReceipt = resolveIssueReceipt(shouldIssueReceipt);
    let receiptResult: ReceiptResult | null = null;
    if (effectiveIssueReceipt) {
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
        paymentId: payment.id,
      });
    }

    await snapshotSessionIfAny(payment);

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
