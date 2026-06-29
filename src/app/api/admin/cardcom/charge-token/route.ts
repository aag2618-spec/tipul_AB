// src/app/api/admin/cardcom/charge-token/route.ts
// חיוב מיידי של טוקן שמור (לחיוב חוזר חודשי, או חיוב אד-הוק).
// יוצר CardcomTransaction ושולח DoTransaction ל-Cardcom.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { invalidateJwtCache } from "@/lib/auth";
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

  // Idempotency — הכותרת נקראת כאן, אבל המפתח נבנה (ונבדק) רק אחרי אימות
  // הגוף, כי הוא חייב לכלול את הנתיב + מזהה תשלום המנוי. בלי רכיב הנתיב/הישות
  // אותו Idempotency-Key במסלול refund היה מחזיר תגובה שגויה (replay חוצה-מסלול).
  const idempotencyKey = request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");

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

  // מפתח idempotency מלא — userId + method + path + מזהה תשלום המנוי + הכותרת.
  // ה-TTL נאכף בקריאה (שורה שפג תוקפה לא תוחזר מהקאש).
  const idempotencyDbKey = idempotencyKey
    ? `${session.user.id}:POST:/api/admin/cardcom/charge-token:${body.subscriptionPaymentId}:${idempotencyKey}`
    : null;
  if (idempotencyDbKey) {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyDbKey },
    });
    if (existing && existing.expiresAt > new Date()) {
      return NextResponse.json(existing.response, { status: existing.statusCode });
    }
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
    // ⚠️ CRITICAL: prevent concurrent charges on the same SubscriptionPayment.
    // Two parallel POSTs would otherwise both pass the `status === "PAID"` read
    // above and create two CardcomTransaction rows ⇒ the card is charged twice
    // (each row gets its own id ⇒ its own uniqueAsmachta, so Cardcom does NOT
    // dedupe). The Idempotency-Key guard above only protects when the SAME
    // header is replayed on both requests — a double-click / two tabs / browser
    // retry usually send NO key or different keys, so they slip through.
    // We reject if any non-terminal ADMIN Cardcom tx already exists for this
    // SubscriptionPayment, and run the check + create at Serializable isolation
    // so a competing tx sees a serialization conflict and aborts. Mirrors the
    // USER path in /api/payments/[id]/charge-saved-token.
    // Cardcom HTTP stays outside withAudit — see create-payment-page for rationale.
    let transaction;
    try {
      transaction = await prisma.$transaction(
        async (tx) => {
          const inFlight = await tx.cardcomTransaction.findFirst({
            where: {
              subscriptionPaymentId: subscriptionPayment.id,
              tenant: "ADMIN",
              status: { in: ["PENDING", "APPROVED"] },
            },
            select: { id: true, status: true },
          });
          if (inFlight) {
            throw new Error(
              inFlight.status === "APPROVED" ? "ALREADY_PAID" : "CHARGE_IN_PROGRESS"
            );
          }
          return tx.cardcomTransaction.create({
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
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (claimErr) {
      const msg = claimErr instanceof Error ? claimErr.message : String(claimErr);
      if (msg === "ALREADY_PAID") {
        return NextResponse.json({ message: "התשלום כבר שולם" }, { status: 409 });
      }
      if (msg === "CHARGE_IN_PROGRESS") {
        return NextResponse.json(
          { message: "כבר מתבצע חיוב לתשלום זה. רענן ונסה שוב." },
          { status: 409 }
        );
      }
      // Postgres serialization failure on a parallel attempt: P2034 / 40001.
      // Treat the loser as "in progress" (the winner is charging right now).
      if (
        claimErr instanceof Prisma.PrismaClientKnownRequestError &&
        (claimErr.code === "P2034" || claimErr.code === "40001")
      ) {
        return NextResponse.json(
          { message: "כבר מתבצע חיוב לתשלום זה. רענן ונסה שוב." },
          { status: 409 }
        );
      }
      throw claimErr;
    }

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
          subscriberUserId: subscriptionPayment.userId,
          statusChanged: !!(user && user.subscriptionStatus !== "PAUSED"),
        };
      }
    );

    // M10.2: subscriptionStatus עלול להשתנות ל-ACTIVE — סוגרים חלון של 30s ב-cache.
    if (result.statusChanged && result.subscriberUserId) {
      invalidateJwtCache(result.subscriberUserId);
    }

    if (idempotencyDbKey) {
      await prisma.idempotencyKey.create({
        data: {
          key: idempotencyDbKey,
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
