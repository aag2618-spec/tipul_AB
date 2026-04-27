// src/app/api/payments/[id]/charge-saved-token/route.ts
// USER-tenant: חיוב מיידי של כרטיס שמור (token) של לקוח.
// מקבילה ל-/api/admin/cardcom/charge-token אבל לזרימת מטפל→לקוח:
//   • ה-Payment מהמטפל ללקוח שלו, לא תשלום מנוי.
//   • Tenant=USER, מסוף Cardcom של המטפל.
//   • הטוקן חייב לשייך לאותו לקוח (clientId) ולאותו מטפל (userId).

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { getUserCardcomClient } from "@/lib/cardcom/user-config";
import { scrubCardcomMessage } from "@/lib/cardcom/verify-webhook";

export const dynamic = "force-dynamic";

interface ChargeTokenBody {
  savedCardTokenId: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId, session } = auth;

  // Idempotency
  const idempotencyKey =
    request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");
  if (idempotencyKey) {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: `${userId}:${idempotencyKey}` },
    });
    if (existing) {
      return NextResponse.json(existing.response, { status: existing.statusCode });
    }
  }

  const { id: paymentId } = await context.params;

  let body: ChargeTokenBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }
  if (!body.savedCardTokenId) {
    return NextResponse.json(
      { message: "savedCardTokenId חובה" },
      { status: 400 }
    );
  }

  // ── Load payment + ownership ────────────────────────────────
  let payment;
  try {
    payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        client: { select: { id: true, name: true, therapistId: true } },
      },
    });
  } catch (dbErr) {
    logger.error("[user/charge-saved-token] payment lookup failed", {
      paymentId,
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
    return NextResponse.json({ message: "שגיאה בחיפוש התשלום" }, { status: 500 });
  }
  if (!payment) {
    return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
  }
  if (payment.client.therapistId !== userId) {
    return NextResponse.json({ message: "אין הרשאה לתשלום זה" }, { status: 403 });
  }
  if (payment.status === "PAID") {
    return NextResponse.json({ message: "התשלום כבר שולם" }, { status: 409 });
  }
  if (payment.status === "REFUNDED" || payment.status === "CANCELLED") {
    return NextResponse.json(
      { message: "התשלום בוטל/הוחזר ולא ניתן לחייב" },
      { status: 409 }
    );
  }
  // ⚠️ Defensive: amount must be positive. Cardcom may accept 0/negative
  // depending on acquirer, leading to bizarre receipts.
  if (Number(payment.amount) <= 0) {
    return NextResponse.json(
      { message: "סכום התשלום חייב להיות גדול מאפס" },
      { status: 400 }
    );
  }

  // ── Load saved token + ownership ────────────────────────────
  const savedToken = await prisma.savedCardToken.findUnique({
    where: { id: body.savedCardTokenId },
  });
  if (!savedToken || !savedToken.isActive || savedToken.deletedAt !== null) {
    return NextResponse.json(
      { message: "כרטיס שמור לא נמצא או לא פעיל" },
      { status: 404 }
    );
  }
  // Strict tenant + ownership: USER tenant, this therapist, and the same client.
  if (
    savedToken.tenant !== "USER" ||
    savedToken.userId !== userId ||
    savedToken.clientId !== payment.client.id
  ) {
    return NextResponse.json(
      { message: "הכרטיס לא שייך ללקוח זה" },
      { status: 403 }
    );
  }

  // Defensive: token expiration
  const now = new Date();
  const tokenMonthEnd = new Date(savedToken.expiryYear, savedToken.expiryMonth, 0, 23, 59, 59);
  if (tokenMonthEnd < now) {
    return NextResponse.json(
      { message: "תוקף הכרטיס השמור פג. יש לבקש מהלקוח כרטיס חדש." },
      { status: 409 }
    );
  }

  try {
    // ⚠️ CRITICAL: prevent concurrent charges on the same Payment.
    // Two parallel POSTs would otherwise both pass the status check above
    // and create two CardcomTransaction rows ⇒ the customer is charged twice
    // (each with a unique uniqueAsmachta = its own tx.id, so Cardcom does
    // NOT dedupe). We reject if any non-terminal Cardcom tx already exists
    // for this Payment, and the check + create runs at Serializable isolation
    // so a competing tx will see a serialization conflict and abort.
    let transaction;
    try {
      transaction = await prisma.$transaction(
        async (tx) => {
          const inFlight = await tx.cardcomTransaction.findFirst({
            where: {
              paymentId: payment.id,
              tenant: "USER",
              status: { in: ["PENDING", "APPROVED"] },
            },
            select: { id: true, status: true },
          });
          if (inFlight) {
            throw new Error(
              inFlight.status === "APPROVED"
                ? "ALREADY_PAID"
                : "CHARGE_IN_PROGRESS"
            );
          }
          return tx.cardcomTransaction.create({
            data: {
              tenant: "USER",
              userId,
              paymentId: payment.id,
              amount: payment.amount,
              currency: "ILS",
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
        return NextResponse.json(
          { message: "התשלום כבר שולם" },
          { status: 409 }
        );
      }
      if (msg === "CHARGE_IN_PROGRESS") {
        return NextResponse.json(
          { message: "כבר מתבצע חיוב לתשלום זה. רענן ונסה שוב." },
          { status: 409 }
        );
      }
      // Postgres serialization failure on parallel attempt: P2034 / 40001.
      // Treat the loser as "in progress".
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
      const client = await getUserCardcomClient(userId);
      if (!client) {
        await prisma.cardcomTransaction.update({
          where: { id: transaction.id },
          data: {
            status: "FAILED",
            errorMessage: "Cardcom client unavailable",
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          { message: "אין למטפל הגדרות Cardcom פעילות" },
          { status: 409 }
        );
      }
      cardcomResult = await client.chargeToken({
        token: savedToken.token,
        amount: Number(payment.amount),
        cardExpiration: { month: savedToken.expiryMonth, year: savedToken.expiryYear },
        description: payment.notes ?? `תשלום עבור ${payment.client.name}`,
        // Cardcom-side idempotency: same internal tx.id ⇒ duplicate detection.
        uniqueAsmachta: transaction.id,
      });
    } catch (cardcomErr) {
      // Scrub possible PAN fragments from the error before persisting/displaying.
      const rawMsg =
        cardcomErr instanceof Error ? cardcomErr.message : String(cardcomErr);
      const safeMsg = scrubCardcomMessage(rawMsg);
      await prisma.cardcomTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "FAILED",
          errorMessage: safeMsg,
          completedAt: new Date(),
        },
      });
      throw cardcomErr;
    }

    const result = await withAudit(
      { kind: "user", session },
      {
        action: "user_cardcom_charge_token",
        targetType: "payment",
        targetId: payment.id,
        details: {
          amount: Number(payment.amount),
          tokenLast4: savedToken.cardLast4,
          responseCode: cardcomResult.responseCode,
          transactionId: transaction.id,
        },
      },
      async (tx) => {
        if (cardcomResult.responseCode !== "0") {
          // Scrub possible PAN fragments from Cardcom error messages.
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

        const completedAt = new Date();
        await tx.cardcomTransaction.update({
          where: { id: transaction.id },
          data: {
            status: "APPROVED",
            transactionId: cardcomResult.transactionId,
            approvalNumber: cardcomResult.approvalNumber,
            completedAt,
          },
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "PAID",
            paidAt: completedAt,
            method: "CREDIT_CARD",
          },
        });
        await tx.savedCardToken.update({
          where: { id: savedToken.id },
          data: { lastUsedAt: completedAt },
        });

        return {
          success: true,
          transactionId: transaction.id,
          approvalNumber: cardcomResult.approvalNumber,
        };
      }
    );

    if (idempotencyKey) {
      try {
        await prisma.idempotencyKey.create({
          data: {
            key: `${userId}:${idempotencyKey}`,
            method: "POST",
            path: `/api/payments/${payment.id}/charge-saved-token`,
            statusCode: 200,
            response: result,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      } catch (idemErr) {
        // Tolerate P2002 — concurrent winner already stored the response.
        if (
          !(idemErr instanceof Prisma.PrismaClientKnownRequestError) ||
          idemErr.code !== "P2002"
        ) {
          throw idemErr;
        }
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error("[user/charge-saved-token] failed", {
      error: err instanceof Error ? err.message : String(err),
      paymentId,
    });
    return NextResponse.json({ message: "שגיאה בחיוב הכרטיס" }, { status: 502 });
  }
}
