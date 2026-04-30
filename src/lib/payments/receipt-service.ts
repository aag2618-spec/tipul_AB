import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { createPaymentReceiptEmail } from "@/lib/email-templates/payment-receipt";
import { createBillingService } from "@/lib/billing";
import { getReceiptPageUrl } from "@/lib/receipt-token";
import { mapPaymentMethod } from "@/lib/email-utils";
import { calculateDebtFromPayments } from "@/lib/payment-utils";
import { logger } from "@/lib/logger";
import { getIsraelYear } from "@/lib/date-utils";
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
  // CRITICAL idempotency — issueReceipt is called from createPaymentForSession,
  // addPartialPayment, AND markFullyPaid; a UI double-click or retry could
  // trigger it twice for the same Payment. With internal numbering the cost
  // was a wasted sequence number; with Cardcom Documents/Create it's a REAL
  // document registered with מערך חשבוניות ישראל that's hard to undo.
  //
  // We use an atomic claim via `updateMany` with `hasReceipt: false` in the
  // WHERE clause — only ONE caller can flip it. The placeholder receiptNumber
  // marks "in flight"; the success path overwrites it with the real number,
  // the failure path releases it (sets hasReceipt back to false).
  //
  // SELF-HEAL — if a previous call crashed mid-flow (e.g. node OOM, container
  // restart) the row is stuck with `hasReceipt:true, receiptNumber:PENDING-*`.
  // Without recovery, the therapist could never re-issue. Reclaim any stale
  // PENDING marker older than 60 seconds: real Cardcom calls take ~1-3s, so
  // 60s is a generous buffer that won't accidentally release an in-flight
  // legitimate call.
  const STALE_CLAIM_MS = 60_000;
  const staleCutoff = Date.now() - STALE_CLAIM_MS;
  try {
    const stale = await prisma.payment.findUnique({
      where: { id: params.paymentId },
      select: { hasReceipt: true, receiptNumber: true },
    });
    if (
      stale?.hasReceipt &&
      stale.receiptNumber?.startsWith("PENDING-")
    ) {
      const tsMatch = stale.receiptNumber.match(/^PENDING-(\d+)-/);
      const staleTs = tsMatch ? Number(tsMatch[1]) : 0;
      if (staleTs > 0 && staleTs < staleCutoff) {
        logger.warn("[issueReceipt] releasing stale PENDING claim", {
          paymentId: params.paymentId,
          claimAgeMs: Date.now() - staleTs,
          marker: stale.receiptNumber,
        });
        await prisma.payment.updateMany({
          where: { id: params.paymentId, receiptNumber: stale.receiptNumber },
          data: { hasReceipt: false, receiptNumber: null, receiptUrl: null },
        });
      }
    }
  } catch (err) {
    // Best-effort self-heal; if it fails we still attempt the claim and the
    // user gets a "כבר בהפקה" soft error if the stale claim is still there.
    logger.warn("[issueReceipt] stale-claim check failed", {
      paymentId: params.paymentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const claimMarker = `PENDING-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const claim = await prisma.payment.updateMany({
    where: { id: params.paymentId, hasReceipt: false },
    data: { hasReceipt: true, receiptNumber: claimMarker },
  });
  if (claim.count === 0) {
    // Lost the race OR receipt already issued. Return whatever's there now.
    const current = await prisma.payment.findUnique({
      where: { id: params.paymentId },
      select: { hasReceipt: true, receiptNumber: true, receiptUrl: true },
    });
    if (current?.receiptNumber?.startsWith("PENDING-")) {
      // Another caller is mid-flight. Don't trust this state — the other
      // caller will finalize it. Return a soft error so the caller can retry
      // in a moment.
      return {
        receiptNumber: null,
        receiptUrl: null,
        hasReceipt: false,
        error: "הקבלה כבר בהפקה — נסי שוב בעוד רגע",
      };
    }
    return {
      receiptNumber: current?.receiptNumber ?? null,
      receiptUrl: current?.receiptUrl ?? null,
      hasReceipt: !!current?.hasReceipt,
    };
  }
  // We hold the claim. Any code path returning from now on must either
  // RELEASE the claim (set hasReceipt=false) on failure, OR REPLACE the
  // placeholder receiptNumber with the real one on success. The helper below
  // releases the claim and re-throws/re-returns.
  const releaseClaim = async () => {
    try {
      await prisma.payment.updateMany({
        where: { id: params.paymentId, receiptNumber: claimMarker },
        data: { hasReceipt: false, receiptNumber: null, receiptUrl: null },
      });
    } catch (releaseErr) {
      logger.error("[issueReceipt] failed to release claim — manual cleanup may be needed", {
        paymentId: params.paymentId,
        claimMarker,
        error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
      });
    }
  };

  // SAFETY NET — `claimResolved` flips to true once the claim is either
  // released OR overwritten with the real receipt info. The `try/finally` at
  // the end of the function calls `releaseClaim()` if NEITHER happened by then
  // (i.e. an uncaught throw mid-flow). Without this, any unexpected failure
  // would leak the placeholder forever and the self-heal at the top would
  // only kick in 60s later. Mark this AFTER the `payment.update` (success
  // paths) or AFTER the explicit `releaseClaim()` call (failure paths).
  let claimResolved = false;
  try {

  const therapist = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { businessType: true },
  });

  if (!therapist || therapist.businessType === "NONE") {
    await releaseClaim();
    claimResolved = true;
    return { receiptNumber: null, receiptUrl: null, hasReceipt: false };
  }

  // Prefer the therapist's Cardcom-issued receipt for ANY business type
  // (EXEMPT or LICENSED) when Cardcom is the primary BillingProvider. Cardcom
  // is a חברת הפקת חשבוניות מוסמכת — their numbering is registered with מערך
  // חשבוניות ישראל, so the receipt is the legal document.
  let cardcomIsPrimary = false;
  try {
    const primary = await prisma.billingProvider.findFirst({
      where: {
        userId: params.userId,
        isActive: true,
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { provider: true },
    });
    cardcomIsPrimary = primary?.provider === "CARDCOM";
  } catch (err) {
    logger.warn("[issueReceipt] failed to load primary BillingProvider — falling back", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (cardcomIsPrimary) {
    const billingService = createBillingService(params.userId);
    let result;
    try {
      result = await billingService.createReceipt({
        clientName: params.clientName,
        clientEmail: params.clientEmail,
        clientPhone: params.clientPhone,
        amount: params.amount,
        description: params.description,
        paymentMethod: mapPaymentMethod(params.method),
        paymentId: params.paymentId,
        sendEmail: false,
      });
    } catch (err) {
      logger.error("[issueReceipt] Cardcom call threw", {
        userId: params.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      // NO silent fallback — see policy comment above. Release the claim so
      // the therapist can retry, and return error so caller surfaces it.
      await releaseClaim();
    claimResolved = true;
      // Translate common English errors from CardcomClient into Hebrew so
      // the therapist sees something useful in the toast.
      const raw = err instanceof Error ? err.message : String(err);
      const hebrewMessage = (() => {
        if (raw.includes("CARDCOM_REFUSE_SANDBOX_IN_PRODUCTION")) {
          return "מסוף sandbox לא מורשה בפרודקשן — שני את ה-mode בהגדרות";
        }
        if (raw.includes("CARDCOM_TIMEOUT")) {
          return "Cardcom לא הגיב בזמן — נסי שוב בעוד רגע";
        }
        if (raw.startsWith("CARDCOM_HTTP_")) {
          return `Cardcom החזיר שגיאה (${raw.replace("CARDCOM_HTTP_", "HTTP ")})`;
        }
        if (raw.includes("CARDCOM_MISSING_")) {
          return "חסרים פרטי מסוף ב-Cardcom — בדקי בהגדרות";
        }
        return `שגיאת תקשורת עם Cardcom — ${raw}`;
      })();
      return {
        receiptNumber: null,
        receiptUrl: null,
        hasReceipt: false,
        error: hebrewMessage,
      };
    }
    if (result.success) {
      const receiptUrl = result.receiptUrl || null;
      const receiptNumber = result.receiptNumber || null;
      // REPLACE the placeholder with the real receipt info.
      await prisma.payment.update({
        where: { id: params.paymentId },
        data: { receiptUrl, receiptNumber, hasReceipt: true },
      });
      claimResolved = true;
      return { receiptNumber, receiptUrl, hasReceipt: true };
    }
    logger.error("[issueReceipt] Cardcom receipt creation failed", {
      userId: params.userId,
      error: String(result.error),
    });
    await releaseClaim();
    claimResolved = true;
    return {
      receiptNumber: null,
      receiptUrl: null,
      hasReceipt: false,
      error: result.error || "Cardcom לא הצליח להפיק קבלה — בדקי הגדרות מסוף",
    };
  }

  if (therapist.businessType === "EXEMPT") {
    const receiptUser = await prisma.user.update({
      where: { id: params.userId },
      data: { nextReceiptNumber: { increment: 1 } },
      select: { nextReceiptNumber: true },
    });
    const reservedNumber = (receiptUser.nextReceiptNumber ?? 2) - 1;
    // שנת קבלה — לפי שעון ישראל (קבלה ב-1.1 00:30 ישראל חייבת לקבל את השנה החדשה)
    const year = getIsraelYear();
    const receiptNumber = `${year}-${String(reservedNumber).padStart(4, "0")}`;
    const receiptUrl = getReceiptPageUrl(params.paymentId);

    // REPLACE the placeholder with the real receipt info.
    await prisma.payment.update({
      where: { id: params.paymentId },
      data: { receiptNumber, receiptUrl, hasReceipt: true },
    });
    claimResolved = true;

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

      // REPLACE the placeholder with the real receipt info.
      await prisma.payment.update({
        where: { id: params.paymentId },
        data: { receiptUrl, receiptNumber, hasReceipt: true },
      });
      claimResolved = true;
      return { receiptNumber, receiptUrl, hasReceipt: true };
    }

    logger.error("Billing receipt creation failed", { error: String(result.error) });
    await releaseClaim();
    claimResolved = true;
    return {
      receiptNumber: null,
      receiptUrl: null,
      hasReceipt: false,
      error: result.error || "שגיאה ביצירת קבלה בספק החיוב",
    };
  } catch (err) {
    logger.error("Error creating receipt via billing provider", { error: err instanceof Error ? err.message : String(err) });
    await releaseClaim();
    claimResolved = true;
    return {
      receiptNumber: null,
      receiptUrl: null,
      hasReceipt: false,
      error: err instanceof Error ? err.message : "שגיאה ביצירת קבלה",
    };
  }
  } finally {
    // SAFETY NET — if any path above threw OR forgot to mark claimResolved
    // (developer bug), release the placeholder so the row isn't stuck. The
    // 60s self-heal at the top is a backup; this finally is the primary
    // protection against orphan PENDING markers.
    if (!claimResolved) {
      logger.warn("[issueReceipt] uncaught path — releasing claim defensively", {
        paymentId: params.paymentId,
      });
      await releaseClaim();
    }
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
      // ⭐ רישום לפי תוצאה אמיתית — לא status SENT קשיח (מטעה במיוחד בשבת)
      await prisma.communicationLog.create({
        data: {
          type: "CUSTOM",
          channel: "EMAIL",
          recipient: client.email.toLowerCase(),
          subject,
          content: html,
          status: emailResult.success ? "SENT" : "FAILED",
          errorMessage: emailResult.success ? null : String(emailResult.error),
          sentAt: emailResult.success ? new Date() : null,
          messageId: emailResult.messageId || null,
          clientId: params.clientId,
          userId: params.userId,
        },
      });
    }

    if (commSettings?.sendReceiptToTherapist !== false && therapist?.email) {
      // משלוח עותק למטפל — לא נרשם ב-log (כבר נרשם ללקוח).
      // בשבת יחזור shabbatBlocked:true בשקט; במוצ"ש ניתן לשלוח ידנית אם רוצים.
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
          relatedEntityId: paymentId,
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
