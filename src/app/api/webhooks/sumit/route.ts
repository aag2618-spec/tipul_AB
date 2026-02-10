// src/app/api/webhooks/sumit/route.ts
// Webhook handler עבור Sumit - תשלומים וקבלות

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySumitWebhook, SumitWebhookPayload } from "@/lib/sumit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-sumit-signature") || "";
    
    // אימות החתימה
    const webhookSecret = process.env.SUMIT_WEBHOOK_SECRET;
    if (webhookSecret && !verifySumitWebhook(body, signature, webhookSecret)) {
      console.error("Invalid Sumit webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload: SumitWebhookPayload = JSON.parse(body);
    console.log("Sumit webhook received:", payload.Event);

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
        console.log("Unhandled webhook event:", payload.Event);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Sumit webhook error:", error);
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

  // מחפשים תשלום שמחכה לעדכון לפי PaymentID
  // ה-PaymentID נשמר בשדה notes או בשדה ייעודי
  const payment = await prisma.payment.findFirst({
    where: {
      notes: {
        contains: PaymentID || "",
      },
      status: "PENDING",
    },
    include: {
      client: {
        include: {
          therapist: true,
        },
      },
    },
  });

  if (payment) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        receiptUrl: DocumentURL,
        hasReceipt: !!DocumentURL,
        notes: payment.notes?.replace(`[PENDING:${PaymentID}]`, `[PAID:${PaymentID}]`),
      },
    });

    // יצירת התראה למטפל
    await prisma.notification.create({
      data: {
        userId: payment.client.therapistId,
        type: "PAYMENT_REMINDER",
        title: "💳 תשלום התקבל",
        content: `התקבל תשלום בסך ₪${Amount} מ-${payment.client.name}`,
        status: "PENDING",
      },
    });
  } else if (Customer?.Email) {
    // אולי זה תשלום מנוי
    const user = await prisma.user.findFirst({
      where: { email: Customer.Email },
    });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "ACTIVE",
          subscriptionStartedAt: user.subscriptionStartedAt || new Date(),
          subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

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

  const payment = await prisma.payment.findFirst({
    where: {
      notes: {
        contains: PaymentID || "",
      },
      status: "PENDING",
    },
    include: {
      client: true,
    },
  });

  if (payment) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        notes: `${payment.notes || ""}\nתשלום נכשל: ${ErrorMessage}`,
      },
    });

    await prisma.notification.create({
      data: {
        userId: payment.client.therapistId,
        type: "CUSTOM",
        title: "❌ תשלום נכשל",
        content: `התשלום מ-${payment.client.name} נכשל: ${ErrorMessage}`,
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

  // עדכון ה-Payment עם קישור למסמך
  const payment = await prisma.payment.findFirst({
    where: {
      notes: {
        contains: PaymentID,
      },
    },
  });

  if (payment) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        receiptUrl: DocumentURL,
        hasReceipt: true,
      },
    });
  }
}
