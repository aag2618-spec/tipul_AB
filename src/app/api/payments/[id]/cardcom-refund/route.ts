// src/app/api/payments/[id]/cardcom-refund/route.ts
// USER-tenant refund — מטפל מזכה לקוח (חוק הגנת הצרכן: עד 14 יום).
// מקבילה ל-/api/admin/cardcom/refund אבל:
//   • אימות בעלות לפי payment.client.therapistId (לא permission-rank).
//   • חוסם עסקאות tenant=ADMIN (אלו של מנויי המערכת).
//   • שימוש ב-getUserCardcomClient(therapistId) — מסוף Cardcom של המטפל.
//   • הגבלת חלון 14 יום מאישור העסקה.
//   • עדכון Payment.status ל-REFUNDED כשהזיכוי מלא.

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { getUserCardcomClient } from "@/lib/cardcom/user-config";
import { capAsmachta } from "@/lib/cardcom/verify-webhook";

export const dynamic = "force-dynamic";

interface RefundBody {
  /** סכום זיכוי חלקי (₪). השמטה = זיכוי מלא של היתרה. */
  amount?: number;
  /** סיבת הזיכוי — חובה (לאודיט וחשבונית הזיכוי). */
  reason: string;
}

/** חלון זיכוי לחוק הגנת הצרכן — 14 יום מאישור העסקה. */
const REFUND_WINDOW_DAYS = 14;

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
    if (existing) return NextResponse.json(existing.response, { status: existing.statusCode });
  }

  const { id: paymentId } = await context.params;

  let body: RefundBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }
  if (!body.reason?.trim()) {
    return NextResponse.json({ message: "סיבת זיכוי (reason) חובה" }, { status: 400 });
  }
  // Cap reason length server-side to match the UI dialog (500 chars) — defense
  // against arbitrary-length payloads that bloat the audit log / DB.
  if (body.reason.length > 500) {
    return NextResponse.json(
      { message: "סיבת זיכוי ארוכה מדי (מקסימום 500 תווים)" },
      { status: 400 }
    );
  }
  if (body.amount !== undefined && (body.amount <= 0 || !Number.isFinite(body.amount))) {
    return NextResponse.json({ message: "סכום זיכוי לא חוקי" }, { status: 400 });
  }

  // ── Load payment + ownership ────────────────────────────────
  let payment;
  try {
    payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { client: { select: { id: true, therapistId: true } } },
    });
  } catch (dbErr) {
    logger.error("[user/cardcom-refund] payment lookup failed", {
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

  // ── Find the latest APPROVED CardcomTransaction for this payment ───
  let transaction;
  try {
    transaction = await prisma.cardcomTransaction.findFirst({
      where: {
        paymentId: payment.id,
        tenant: "USER",
        userId,
        status: "APPROVED",
      },
      orderBy: { completedAt: "desc" },
    });
  } catch (dbErr) {
    logger.error("[user/cardcom-refund] tx lookup failed", {
      paymentId,
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
    return NextResponse.json({ message: "שגיאה בחיפוש העסקה" }, { status: 500 });
  }
  if (!transaction) {
    return NextResponse.json(
      { message: "לא נמצאה עסקת Cardcom מאושרת עבור תשלום זה" },
      { status: 404 }
    );
  }
  // ADMIN-tenant transactions never appear here (filtered above), but defensive:
  if (transaction.tenant !== "USER") {
    return NextResponse.json(
      { message: "מסלול זה תומך רק בעסקאות USER (מטפל→לקוח)" },
      { status: 403 }
    );
  }
  if (!transaction.transactionId) {
    return NextResponse.json(
      { message: "חסר מזהה עסקה ב-Cardcom — לא ניתן לזכות" },
      { status: 409 }
    );
  }

  // ── 14-day window (חוק הגנת הצרכן) ─────────────────────────
  const approvedAt = transaction.completedAt ?? transaction.createdAt;
  const ageMs = Date.now() - approvedAt.getTime();
  const windowMs = REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (ageMs > windowMs) {
    return NextResponse.json(
      {
        message: `חלף חלון הזיכוי (${REFUND_WINDOW_DAYS} ימים מאישור העסקה). יש לפנות לתמיכה.`,
      },
      { status: 409 }
    );
  }

  // ── Atomic claim of refund slice (זהה ל-admin refund) ──────
  const originalAmount = Number(transaction.amount);
  const requestedAmount = body.amount;
  const expectedAlreadyDec = new Prisma.Decimal(transaction.refundedAmount);
  const provisionalRefundDec =
    requestedAmount !== undefined
      ? new Prisma.Decimal(requestedAmount)
      : new Prisma.Decimal(originalAmount).minus(expectedAlreadyDec);

  if (provisionalRefundDec.lte(0)) {
    return NextResponse.json({ message: "אין יתרה לזיכוי" }, { status: 409 });
  }
  const claimedNewTotalDec = expectedAlreadyDec.plus(provisionalRefundDec);
  if (claimedNewTotalDec.gt(new Prisma.Decimal(originalAmount).plus(0.01))) {
    return NextResponse.json(
      { message: "סכום הזיכוי חורג מהסכום המקורי" },
      { status: 409 }
    );
  }

  const claimUpdate = await prisma.cardcomTransaction.updateMany({
    where: {
      id: transaction.id,
      refundedAmount: expectedAlreadyDec,
      status: "APPROVED",
    },
    data: { refundedAmount: claimedNewTotalDec },
  });
  if (claimUpdate.count === 0) {
    return NextResponse.json(
      { message: "מצב הזיכוי השתנה. רענן ונסה שוב." },
      { status: 409 }
    );
  }

  const refundAmount = provisionalRefundDec.toNumber();
  const expectedAlready = expectedAlreadyDec.toNumber();
  const newRefundedTotal = claimedNewTotalDec.toNumber();
  const isPartial = claimedNewTotalDec.lt(
    new Prisma.Decimal(originalAmount).minus(0.01)
  );

  const releaseClaim = async () => {
    const released = await prisma.cardcomTransaction.updateMany({
      where: { id: transaction.id, refundedAmount: claimedNewTotalDec },
      data: { refundedAmount: expectedAlreadyDec },
    });
    if (released.count === 0) {
      // Concurrent mutation changed refundedAmount in between — claim is now
      // "stuck" and must be reconciled manually. Log loudly.
      logger.error("[user/cardcom-refund] releaseClaim FAILED — manual reconcile needed", {
        cardcomTransactionId: transaction.id,
        expectedClaimedTotal: claimedNewTotalDec.toString(),
        priorRefundedAmount: expectedAlreadyDec.toString(),
      });
    }
  };

  try {
    // Cardcom HTTP outside the audit transaction (timeout race).
    let refundResult;
    try {
      const client = await getUserCardcomClient(userId);
      if (!client) {
        await releaseClaim();
        return NextResponse.json(
          { message: "אין למטפל הגדרות Cardcom פעילות" },
          { status: 409 }
        );
      }
      refundResult = await client.refundTransaction({
        transactionId: transaction.transactionId!,
        amount: requestedAmount,
        reason: body.reason,
        // Idempotency on Cardcom side — same slice ⇒ same key.
        uniqueAsmachta: capAsmachta(
          `r:${transaction.id}:${newRefundedTotal.toFixed(2)}`
        ),
      });
    } catch (cardcomErr) {
      await releaseClaim();
      throw cardcomErr;
    }

    if (refundResult.responseCode !== "0") {
      await releaseClaim();
      throw new Error(
        `Cardcom refund failed: ${refundResult.errorMessage ?? refundResult.responseCode}`
      );
    }

    const fallbackDocNumber =
      refundResult.refundId || `REFUND-${transaction.id}-${crypto.randomUUID()}`;

    const result = await withAudit(
      { kind: "user", session },
      {
        action: isPartial ? "user_cardcom_refund_partial" : "user_cardcom_refund_full",
        targetType: "cardcom_transaction",
        targetId: transaction.id,
        details: {
          paymentId: payment.id,
          originalAmount,
          refundAmount,
          alreadyRefunded: expectedAlready,
          newRefundedTotal,
          isPartial,
          reason: body.reason,
          cardcomRefundId: refundResult.refundId,
        },
      },
      async (tx) => {
        const now = new Date();

        const originalInvoice = await tx.cardcomInvoice.findFirst({
          where: { cardcomTransactionId: transaction.id, status: "ISSUED" },
          orderBy: { issuedAt: "desc" },
        });

        // ⚠️ Do NOT overwrite `completedAt` on partial refunds: it is the
        // anchor for the 14-day refund window (חוק הגנת הצרכן). If we move
        // it forward on every partial refund, the window slides and the
        // legal deadline gets erroneously extended.
        await tx.cardcomTransaction.update({
          where: { id: transaction.id },
          data: isPartial
            ? { status: "APPROVED" }
            : { status: "REFUNDED", completedAt: now },
        });

        // Update parent Payment.status to REFUNDED on FULL refund.
        // For partial refund we leave the payment as PAID (the therapist sees
        // the partial refund in the cardcom transaction details).
        if (!isPartial) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "REFUNDED" },
          });
        }

        // Create a refund-credit invoice record + link to the original.
        let refundInvoice = null;
        if (originalInvoice) {
          refundInvoice = await tx.cardcomInvoice.create({
            data: {
              tenant: originalInvoice.tenant,
              cardcomDocumentNumber: fallbackDocNumber,
              cardcomDocumentType: "Refund",
              allocationNumber: refundResult.allocationNumber ?? null,
              issuerUserId: originalInvoice.issuerUserId,
              issuerBusinessType: originalInvoice.issuerBusinessType,
              issuerBusinessName: originalInvoice.issuerBusinessName,
              issuerIdNumber: originalInvoice.issuerIdNumber,
              vatRateSnapshot: originalInvoice.vatRateSnapshot,
              subscriberId: originalInvoice.subscriberId,
              subscriberNameSnapshot: originalInvoice.subscriberNameSnapshot,
              subscriberEmailSnapshot: originalInvoice.subscriberEmailSnapshot,
              recipientClientId: originalInvoice.recipientClientId,
              subscriptionPaymentId: originalInvoice.subscriptionPaymentId,
              paymentId: originalInvoice.paymentId,
              cardcomTransactionId: transaction.id,
              amount: refundAmount,
              currency: originalInvoice.currency,
              description: `זיכוי: ${body.reason}`,
              status: "ISSUED",
              occurredAt: now,
              issuedAt: now,
            },
          });
          await tx.cardcomInvoice.update({
            where: { id: originalInvoice.id },
            data: {
              refundInvoiceId: refundInvoice.id,
              ...(isPartial ? {} : { status: "REFUNDED" as const }),
            },
          });
        }

        return {
          success: true,
          refundId: refundResult.refundId,
          allocationNumber: refundResult.allocationNumber ?? null,
          isPartial,
          refundedAmount: newRefundedTotal,
          remainingAmount: originalAmount - newRefundedTotal,
          refundInvoiceId: refundInvoice?.id ?? null,
        };
      }
    );

    if (idempotencyKey) {
      try {
        await prisma.idempotencyKey.create({
          data: {
            key: `${userId}:${idempotencyKey}`,
            method: "POST",
            path: `/api/payments/${payment.id}/cardcom-refund`,
            statusCode: 200,
            response: result,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      } catch (idemErr) {
        // P2002 = unique violation: another concurrent request stored it
        // first (rare race after both passed the initial check). Tolerate.
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
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[user/cardcom-refund] failed", {
      paymentId,
      transactionId: transaction.id,
      error: message,
    });
    // Return a fixed Hebrew message — never leak Cardcom internals to the
    // client (could echo PAN fragments / vendor strings). Full detail goes
    // to logs for debugging.
    return NextResponse.json(
      { message: "זיכוי נכשל. נסה שוב או פנה לתמיכה." },
      { status: 502 }
    );
  }
}
