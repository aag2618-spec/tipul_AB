// src/app/api/admin/cardcom/charge-token/route.ts
// חיוב מיידי של טוקן שמור (לחיוב חוזר חודשי, או חיוב אד-הוק).
// יוצר CardcomTransaction ושולח DoTransaction ל-Cardcom.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { getAdminCardcomClient } from "@/lib/cardcom/admin-config";
import { scrubCardcomMessage } from "@/lib/cardcom/verify-webhook";

export const dynamic = "force-dynamic";

interface ChargeTokenBody {
  subscriptionPaymentId: string;
  savedCardTokenId: string;
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

  let body: ChargeTokenBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }

  if (!body.subscriptionPaymentId || !body.savedCardTokenId) {
    return NextResponse.json(
      { message: "subscriptionPaymentId ו-savedCardTokenId חובה" },
      { status: 400 }
    );
  }

  const [subscriptionPayment, savedToken] = await Promise.all([
    prisma.subscriptionPayment.findUnique({ where: { id: body.subscriptionPaymentId } }),
    prisma.savedCardToken.findUnique({ where: { id: body.savedCardTokenId } }),
  ]);

  if (!subscriptionPayment) {
    return NextResponse.json({ message: "תשלום מנוי לא נמצא" }, { status: 404 });
  }
  if (subscriptionPayment.status === "PAID") {
    return NextResponse.json({ message: "התשלום כבר שולם" }, { status: 409 });
  }
  if (!savedToken || !savedToken.isActive || savedToken.deletedAt !== null) {
    return NextResponse.json({ message: "כרטיס שמור לא נמצא או לא פעיל" }, { status: 404 });
  }
  if (savedToken.tenant !== "ADMIN" || savedToken.subscriberId !== subscriptionPayment.userId) {
    return NextResponse.json({ message: "הכרטיס לא שייך למנוי זה" }, { status: 403 });
  }

  try {
    // Cardcom HTTP outside withAudit — see create-payment-page for rationale.
    const transaction = await prisma.cardcomTransaction.create({
      data: {
        tenant: "ADMIN",
        userId: subscriptionPayment.userId,
        subscriptionPaymentId: subscriptionPayment.id,
        amount: subscriptionPayment.amount,
        currency: subscriptionPayment.currency,
        status: "PENDING",
        cardLast4: savedToken.cardLast4,
        cardHolder: savedToken.cardHolder,
      },
    });

    let cardcomResult;
    try {
      const client = await getAdminCardcomClient();
      cardcomResult = await client.chargeToken({
        token: savedToken.token,
        amount: Number(subscriptionPayment.amount),
        cardExpiration: { month: savedToken.expiryMonth, year: savedToken.expiryYear },
        description: subscriptionPayment.description ?? "מנוי MyTipul",
        // Idempotency: same transaction.id on retry → Cardcom rejects as duplicate.
        uniqueAsmachta: transaction.id,
      });
    } catch (cardcomErr) {
      // Cardcom HTTP error bodies have rarely echoed PAN fragments — scrub
      // before persisting (defense-in-depth even though the typical message
      // is "ECONNREFUSED" or similar).
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
        action: "cardcom_charge_token",
        targetType: "subscription_payment",
        targetId: subscriptionPayment.id,
        details: {
          amount: Number(subscriptionPayment.amount),
          tokenLast4: savedToken.cardLast4,
          responseCode: cardcomResult.responseCode,
          transactionId: transaction.id,
        },
      },
      async (tx) => {
        if (cardcomResult.responseCode !== "0") {
          // Scrub PAN fragments and truncate before storing — Cardcom error
          // bodies have rarely echoed card digits in `Description`. Persist a
          // safe value to DB and surface the same to UI.
          const scrubbedError = scrubCardcomMessage(cardcomResult.errorMessage);
          await tx.cardcomTransaction.update({
            where: { id: transaction.id },
            data: {
              status: "DECLINED",
              errorCode: cardcomResult.responseCode,
              errorMessage: scrubbedError,
              completedAt: new Date(),
            },
          });
          return {
            success: false,
            transactionId: transaction.id,
            errorCode: cardcomResult.responseCode,
            errorMessage: scrubbedError ?? "החיוב נדחה",
          };
        }

        const now = new Date();
        await tx.cardcomTransaction.update({
          where: { id: transaction.id },
          data: {
            status: "APPROVED",
            transactionId: cardcomResult.transactionId,
            approvalNumber: cardcomResult.approvalNumber,
            completedAt: now,
          },
        });
        await tx.subscriptionPayment.update({
          where: { id: subscriptionPayment.id },
          data: { status: "PAID", paidAt: now, method: "CREDIT_CARD" },
        });
        await tx.savedCardToken.update({
          where: { id: savedToken.id },
          data: { lastUsedAt: now },
        });
        // Only set ACTIVE — never override PAUSED (admin manual pause)
        const user = await tx.user.findUnique({
          where: { id: subscriptionPayment.userId },
          select: { subscriptionStatus: true },
        });
        if (user && user.subscriptionStatus !== "PAUSED") {
          await tx.user.update({
            where: { id: subscriptionPayment.userId },
            data: { subscriptionStatus: "ACTIVE" },
          });
        }

        return {
          success: true,
          transactionId: transaction.id,
          approvalNumber: cardcomResult.approvalNumber,
        };
      }
    );

    if (idempotencyKey) {
      await prisma.idempotencyKey.create({
        data: {
          key: `${session.user.id}:${idempotencyKey}`,
          method: "POST",
          path: "/api/admin/cardcom/charge-token",
          statusCode: result.success ? 200 : 200, // both reported via JSON body
          response: result,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error("[admin/cardcom/charge-token] failed", {
      error: err instanceof Error ? err.message : String(err),
      subscriptionPaymentId: body.subscriptionPaymentId,
    });
    return NextResponse.json({ message: "שגיאה בחיוב הכרטיס" }, { status: 502 });
  }
}
