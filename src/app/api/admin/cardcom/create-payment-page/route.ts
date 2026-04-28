// src/app/api/admin/cardcom/create-payment-page/route.ts
// יוצר CardcomTransaction בסטטוס PENDING וקורא ל-Cardcom LowProfile/Create
// כדי לקבל URL לדף תשלום. מחזיר {url, lowProfileId, transactionId} ל-UI.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { getAdminCardcomClient } from "@/lib/cardcom/admin-config";
import { scrubCardcomMessage } from "@/lib/cardcom/verify-webhook";
import { getAdminBusinessProfile } from "@/lib/site-settings";
import type { CardcomDocumentType } from "@/lib/cardcom/types";

export const dynamic = "force-dynamic";

interface CreatePaymentPageBody {
  subscriptionPaymentId: string;
  createToken?: boolean;
  /** Number of installments (1-36). Defaults to 1. */
  numOfPayments?: number;
  successRedirectUrl?: string;
  failedRedirectUrl?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("billing.cardcom.charge_subscriber");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  // Idempotency
  const idempotencyKey = request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");
  if (idempotencyKey) {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: `${session.user.id}:${idempotencyKey}` },
    });
    if (existing) {
      return NextResponse.json(existing.response, { status: existing.statusCode });
    }
  }

  let body: CreatePaymentPageBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }

  if (!body.subscriptionPaymentId) {
    return NextResponse.json({ message: "subscriptionPaymentId חסר" }, { status: 400 });
  }

  const subscriptionPayment = await prisma.subscriptionPayment.findUnique({
    where: { id: body.subscriptionPaymentId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!subscriptionPayment) {
    return NextResponse.json({ message: "תשלום מנוי לא נמצא" }, { status: 404 });
  }
  if (subscriptionPayment.status === "PAID") {
    return NextResponse.json({ message: "התשלום כבר שולם" }, { status: 409 });
  }

  const businessProfile = await getAdminBusinessProfile();
  const documentType: CardcomDocumentType =
    businessProfile.type === "LICENSED" ? "TaxInvoiceAndReceipt" : "Receipt";

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://mytipul.co.il";

  try {
    // ⚠️ Cardcom HTTP call MUST happen OUTSIDE the withAudit transaction.
    // withAudit uses Serializable isolation with a 10s timeout — Cardcom may
    // take up to 15s, which would roll back the DB while the LowProfile
    // already exists at Cardcom (orphan).
    //
    // Pattern:
    //   1. Create CardcomTransaction (PENDING) outside tx so we have a stable id.
    //   2. Call Cardcom using transaction.id as ReturnValue.
    //   3. Update transaction with lowProfileId inside withAudit.
    //   4. If step 2 fails → mark transaction FAILED and return error.

    const transaction = await prisma.cardcomTransaction.create({
      data: {
        tenant: "ADMIN",
        userId: subscriptionPayment.userId,
        subscriptionPaymentId: subscriptionPayment.id,
        amount: subscriptionPayment.amount,
        currency: subscriptionPayment.currency,
        status: "PENDING",
      },
    });

    let cardcomResult;
    try {
      const client = await getAdminCardcomClient();
      // Allow ADMIN to opt into installments (1-36) for annual subscriptions etc.
      const numOfPayments = Math.min(Math.max(body.numOfPayments ?? 1, 1), 36);
      cardcomResult = await client.createPaymentPage({
        amount: Number(subscriptionPayment.amount),
        description: subscriptionPayment.description ?? `מנוי MyTipul`,
        returnValue: transaction.id,
        successRedirectUrl: body.successRedirectUrl ?? `${baseUrl}/admin/billing?status=success`,
        failedRedirectUrl: body.failedRedirectUrl ?? `${baseUrl}/admin/billing?status=failed`,
        webhookUrl: `${baseUrl}/api/webhooks/cardcom/admin`,
        createToken: !!body.createToken,
        numOfPayments,
        language: "he",
        // Idempotency: HTTP retry won't create a second LowProfile at Cardcom.
        uniqueAsmachta: transaction.id,
        documentType,
        customer: {
          name: subscriptionPayment.user.name ?? "Subscriber",
          email: subscriptionPayment.user.email ?? undefined,
        },
        products: [
          {
            description: subscriptionPayment.description ?? "מנוי MyTipul",
            unitCost: Number(subscriptionPayment.amount),
            quantity: 1,
          },
        ],
      });
    } catch (cardcomErr) {
      // Scrub PAN fragments from Cardcom error body before persisting.
      const rawMessage =
        cardcomErr instanceof Error ? cardcomErr.message : String(cardcomErr);
      await prisma.cardcomTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "FAILED",
          errorMessage: scrubCardcomMessage(rawMessage),
          completedAt: new Date(),
        },
      });
      throw cardcomErr;
    }

    const result = await withAudit(
      { kind: "user", session },
      {
        action: "cardcom_create_payment_page",
        targetType: "subscription_payment",
        targetId: subscriptionPayment.id,
        details: {
          amount: Number(subscriptionPayment.amount),
          subscriberId: subscriptionPayment.userId,
          createToken: !!body.createToken,
          transactionId: transaction.id,
        },
      },
      async (tx) => {
        const updated = await tx.cardcomTransaction.update({
          where: { id: transaction.id },
          data: { lowProfileId: cardcomResult.lowProfileId },
        });
        return {
          transactionId: updated.id,
          lowProfileId: cardcomResult.lowProfileId,
          url: cardcomResult.url,
        };
      }
    );

    const responseBody = result;
    if (idempotencyKey) {
      await prisma.idempotencyKey.create({
        data: {
          key: `${session.user.id}:${idempotencyKey}`,
          method: "POST",
          path: "/api/admin/cardcom/create-payment-page",
          statusCode: 200,
          response: responseBody,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }

    return NextResponse.json(responseBody);
  } catch (err) {
    logger.error("[admin/cardcom/create-payment-page] failed", {
      error: err instanceof Error ? err.message : String(err),
      subscriptionPaymentId: body.subscriptionPaymentId,
    });
    return NextResponse.json(
      { message: "שגיאה ביצירת דף תשלום" },
      { status: 502 }
    );
  }
}
