// src/app/api/webhooks/sumit/route.ts
// Webhook handler עבור Sumit - תשלומים וקבלות

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySumitWebhook, SumitWebhookPayload } from "@/lib/sumit";
import { logger } from "@/lib/logger";
import { completeWebhookPayment } from "@/lib/payments/receipt-service";
import { verifyPaymentByExternalId } from "@/lib/webhook-verification";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-sumit-signature") || "";
    
    // אימות החתימה
    const webhookSecret = process.env.SUMIT_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    if (!verifySumitWebhook(body, signature, webhookSecret)) {
      logger.error("Invalid Sumit webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload: SumitWebhookPayload = JSON.parse(body);
    logger.info("Sumit webhook received:", { data: payload.Event });

    switch (payload.Event) {
      case "payment.success":
        await handlePaymentSuccess(payload);
        break;
      case "payment.failed":
        await handlePaymentFailed(payload);
        break;
      case "document.created":
        await handleDocumentCreated(payload);
        break;
      default:
        logger.info("Unhandled webhook event:", { data: payload.Event });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("Sumit webhook error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * טיפול בתשלום מוצלח
 */
async function handlePaymentSuccess(payload: SumitWebhookPayload) {
  const { PaymentID, Amount, DocumentURL, Customer } = payload;

  // ── אימות בעלות + lookup atomic ──
  // מחפשים payment PENDING לפי PaymentID החיצוני (Sumit), ומקבלים
  // את ה-therapistId האמיתי מ-DB. שום payload field לא משמש כסמכות.
  const verified = await verifyPaymentByExternalId(PaymentID);

  if (verified) {
    // קבל את ה-notes הנוכחי לעדכון string replacement
    const currentPayment = await prisma.payment.findUnique({
      where: { id: verified.paymentId },
      select: { notes: true },
    });

    // עדכון atomic — count check מבטיח שהפעולה הצליחה
    const updateResult = await prisma.payment.updateMany({
      where: {
        id: verified.paymentId,
        client: { therapistId: verified.therapistId },
        status: "PENDING", // race-safe: רק אם עדיין PENDING
      },
      data: {
        status: "PAID",
        paidAt: new Date(),
        receiptUrl: DocumentURL,
        hasReceipt: !!DocumentURL,
        notes: currentPayment?.notes?.replace(
          `[PENDING:${PaymentID}]`,
          `[PAID:${PaymentID}]`
        ),
      },
    });

    if (updateResult.count === 0) {
      logger.warn("[Sumit] payment.success — already paid or not PENDING", {
        paymentId: verified.paymentId,
      });
      return;
    }

    // יצירת התראה למטפל — תמיד עם therapistId המאומת
    await prisma.notification.create({
      data: {
        userId: verified.therapistId,
        type: "PAYMENT_REMINDER",
        title: "💳 תשלום התקבל",
        content: `התקבל תשלום בסך ₪${Amount} מ-${verified.clientName || "המטופל"}`,
        status: "PENDING",
      },
    });

    // Send receipt email + complete COLLECT_PAYMENT task
    await completeWebhookPayment(verified.paymentId);
  } else if (Customer?.Email) {
    // אולי זה תשלום מנוי
    const user = await prisma.user.findFirst({
      where: { email: Customer.Email },
    });

    if (user) {
      const wasBlocked = user.isBlocked;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "ACTIVE",
          subscriptionStartedAt: user.subscriptionStartedAt || new Date(),
          subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          // שחרור חסימה אם הייתה (ככל הנראה בגלל חוב)
          ...(wasBlocked && { isBlocked: false }),
        },
      });
      if (wasBlocked) {
        logger.info("[sumit] auto-unblock on subscription payment", { userId: user.id });
      }

      await prisma.subscriptionPayment.create({
        data: {
          userId: user.id,
          amount: Amount || 0,
          currency: "ILS",
          status: "PAID",
          description: "תשלום מנוי חודשי",
          invoiceUrl: DocumentURL,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          paidAt: new Date(),
        },
      });
    }
  }
}

/**
 * טיפול בתשלום שנכשל
 */
async function handlePaymentFailed(payload: SumitWebhookPayload) {
  const { PaymentID, ErrorMessage, Customer } = payload;

  // ── אימות בעלות + lookup atomic ──
  const verified = await verifyPaymentByExternalId(PaymentID);

  if (verified) {
    const currentPayment = await prisma.payment.findUnique({
      where: { id: verified.paymentId },
      select: { notes: true },
    });

    const updateResult = await prisma.payment.updateMany({
      where: {
        id: verified.paymentId,
        client: { therapistId: verified.therapistId },
      },
      data: {
        notes: `${currentPayment?.notes || ""}\nתשלום נכשל: ${ErrorMessage}`,
      },
    });

    if (updateResult.count === 0) {
      logger.warn("[Sumit] payment.failed update — no rows affected", {
        paymentId: verified.paymentId,
      });
      return;
    }

    await prisma.notification.create({
      data: {
        userId: verified.therapistId,
        type: "CUSTOM",
        title: "❌ תשלום נכשל",
        content: `התשלום מ-${verified.clientName || "המטופל"} נכשל: ${ErrorMessage}`,
        status: "PENDING",
      },
    });
  } else if (Customer?.Email) {
    // תשלום מנוי שנכשל
    const user = await prisma.user.findFirst({
      where: { email: Customer.Email },
    });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "PAST_DUE",
        },
      });

      await prisma.adminAlert.create({
        data: {
          userId: user.id,
          type: "PAYMENT_FAILED",
          title: "תשלום מנוי נכשל",
          message: `תשלום מנוי נכשל עבור ${user.name}: ${ErrorMessage}`,
          priority: "HIGH",
        },
      });
    }
  }
}

/**
 * טיפול ביצירת מסמך (קבלה/חשבונית)
 */
async function handleDocumentCreated(payload: SumitWebhookPayload) {
  const { DocumentID, DocumentURL, PaymentID } = payload;

  if (!PaymentID) return;

  // ── אימות שPaymentID שייך באמת לpayment במערכת ──
  // עדכון ה-Payment עם קישור למסמך — אבל רק אם payment לגיטימי קיים
  // ולא נחסם ע"י תוקף שיודע סנגנון של PaymentID חיצוני.
  const payment = await prisma.payment.findFirst({
    where: {
      notes: { contains: PaymentID },
    },
    select: {
      id: true,
      client: { select: { therapistId: true } },
    },
  });

  if (payment && payment.client?.therapistId) {
    await prisma.payment.updateMany({
      where: {
        id: payment.id,
        client: { therapistId: payment.client.therapistId },
      },
      data: {
        receiptUrl: DocumentURL,
        hasReceipt: true,
      },
    });
  } else {
    logger.warn("[Sumit] document.created — no matching payment found", {
      PaymentID,
      DocumentID,
    });
  }
}
