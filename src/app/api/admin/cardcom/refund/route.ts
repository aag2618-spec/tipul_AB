// src/app/api/admin/cardcom/refund/route.ts
// Refund flow — V1, חוק הגנת הצרכן (14 יום זכות החזר).
// משתמש ב-payments.refund הקיים (rank 10 — ADMIN בלבד).
// קורא ל-Cardcom Transactions/RefundByTransactionId, מעדכן CardcomTransaction
// ובקבלה הקשורה — מעדכן CardcomInvoice.status=REFUNDED + יוצר חשבונית-זיכוי קישור.

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { getAdminCardcomClient } from "@/lib/cardcom/admin-config";
import { capAsmachta } from "@/lib/cardcom/verify-webhook";

export const dynamic = "force-dynamic";

interface RefundBody {
  cardcomTransactionId: string;
  /** Optional partial amount; omit for full refund. */
  amount?: number;
  reason: string;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("payments.refund");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  // Idempotency
  const idempotencyKey = request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");
  if (idempotencyKey) {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: `${session.user.id}:${idempotencyKey}` },
    });
    if (existing) return NextResponse.json(existing.response, { status: existing.statusCode });
  }

  let body: RefundBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }

  if (!body.cardcomTransactionId || !body.reason?.trim()) {
    return NextResponse.json(
      { message: "cardcomTransactionId ו-reason חובה" },
      { status: 400 }
    );
  }
  if (body.amount !== undefined && (body.amount <= 0 || !Number.isFinite(body.amount))) {
    return NextResponse.json({ message: "סכום זיכוי לא חוקי" }, { status: 400 });
  }

  let transaction;
  try {
    transaction = await prisma.cardcomTransaction.findUnique({
      where: { id: body.cardcomTransactionId },
    });
  } catch (dbErr) {
    logger.error("[admin/cardcom/refund] DB lookup failed", {
      cardcomTransactionId: body.cardcomTransactionId,
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
    return NextResponse.json({ message: "שגיאה בחיפוש העסקה" }, { status: 500 });
  }
  if (!transaction) {
    return NextResponse.json({ message: "עסקה לא נמצאה" }, { status: 404 });
  }
  // Tenant guard: this route uses getAdminCardcomClient() (ADMIN terminal).
  // Refunding a USER-tenant transaction here would call the WRONG Cardcom
  // terminal and corrupt accounting. USER refunds must go through a
  // dedicated user-tenant route (separate concern, not implemented here).
  if (transaction.tenant !== "ADMIN") {
    logger.warn("[admin/cardcom/refund] blocked non-ADMIN tenant refund", {
      cardcomTransactionId: transaction.id,
      tenant: transaction.tenant,
      adminUserId: session.user.id,
    });
    return NextResponse.json(
      {
        message:
          "ניתן לזכות מסלול זה רק עסקאות של מנויי המערכת (ADMIN). עסקת מטפל→לקוח מטופלת במסלול נפרד.",
      },
      { status: 403 }
    );
  }
  if (transaction.status !== "APPROVED") {
    return NextResponse.json(
      { message: "ניתן לבצע זיכוי רק על עסקה שאושרה" },
      { status: 409 }
    );
  }
  if (!transaction.transactionId) {
    return NextResponse.json(
      { message: "חסר מזהה עסקה ב-Cardcom — לא ניתן לזכות" },
      { status: 409 }
    );
  }

  // CRITICAL: amount validation must be ATOMIC (avoid race where two concurrent
  // partial refunds both pass validation and over-refund).
  // We claim a slice of refundedAmount BEFORE calling Cardcom; if the HTTP call
  // fails, we release the claim. This prevents over-refund through Cardcom even
  // under concurrent calls.
  const originalAmount = Number(transaction.amount);
  const requestedAmount = body.amount;

  // Atomic claim of the slice. We use Prisma.Decimal for the comparison to
  // avoid float-precision mismatches (e.g. 0.1 + 0.2 = 0.30000000000000004
  // would fail to match the value we wrote earlier in raw Number form).
  const expectedAlreadyDec = new Prisma.Decimal(transaction.refundedAmount);
  const provisionalRefundDec = requestedAmount !== undefined
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

  // Atomic claim — only succeeds if refundedAmount is still expectedAlreadyDec.
  // Prisma compares Decimal columns by exact value when given a Decimal type.
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
  const claimedNewTotal = newRefundedTotal;
  const isPartial = claimedNewTotalDec.lt(new Prisma.Decimal(originalAmount).minus(0.01));

  // Helper to release the claimed slice on failure (Decimal-equal where).
  const releaseClaim = async () => {
    await prisma.cardcomTransaction.updateMany({
      where: { id: transaction.id, refundedAmount: claimedNewTotalDec },
      data: { refundedAmount: expectedAlreadyDec },
    });
  };

  try {
    // Cardcom HTTP outside withAudit (timeout race) — see create-payment-page.
    let refundResult;
    try {
      const client = await getAdminCardcomClient();
      refundResult = await client.refundTransaction({
        transactionId: transaction.transactionId!,
        amount: requestedAmount,
        reason: body.reason,
        // Idempotency key on Cardcom side — combines source tx with claimed total
        // so a retry of the SAME refund is a no-op, while a NEW refund (different
        // claimedNewTotal) is a fresh request. capAsmachta keeps it ≤30 chars.
        uniqueAsmachta: capAsmachta(
          `r:${transaction.id}:${claimedNewTotal.toFixed(2)}`
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

    // originalInvoice is fetched INSIDE the audit tx below to avoid a TOCTOU
    // race where someone voids the invoice between read and the write.

    // Generate a guaranteed-unique document number: prefer Cardcom's refundId,
    // fall back to a FULL uuid suffix (32 hex chars = 128 bits, collision-free
    // even at billions of partial refunds).
    //
    // RECONCILIATION CAVEAT: when we fall back to the synthetic
    // `REFUND-${tx}-${uuid}` form, the value is NOT a real Cardcom document
    // number. Operations that reconcile by document number (e.g. searching
    // Cardcom's portal) must filter out rows whose number starts with
    // `REFUND-` and look them up by `cardcomTransactionId` instead.
    const fallbackDocNumber =
      refundResult.refundId || `REFUND-${transaction.id}-${crypto.randomUUID()}`;

    const result = await withAudit(
      { kind: "user", session },
      {
        action: isPartial ? "cardcom_refund_partial" : "cardcom_refund_full",
        targetType: "cardcom_transaction",
        targetId: transaction.id,
        details: {
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

        // Read the original invoice INSIDE the tx (atomicity vs. concurrent void).
        const originalInvoice = await tx.cardcomInvoice.findFirst({
          where: { cardcomTransactionId: transaction.id, status: "ISSUED" },
          orderBy: { issuedAt: "desc" },
        });

        await tx.cardcomTransaction.update({
          where: { id: transaction.id },
          data: {
            // Only mark fully REFUNDED when nothing remains. Partial refunds keep APPROVED.
            status: isPartial ? "APPROVED" : "REFUNDED",
            completedAt: now,
          },
        });

        // Mark SubscriptionPayment REFUNDED only on full refund
        if (transaction.subscriptionPaymentId && !isPartial) {
          await tx.subscriptionPayment.update({
            where: { id: transaction.subscriptionPaymentId },
            data: { status: "REFUNDED" },
          });
        }

        // Create a refund-credit invoice record + link to the original
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

          // Always link via refundInvoiceId — partial refunds use refundOf[] (one-to-many).
          // For full refund we also flip the original's status to REFUNDED.
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
      await prisma.idempotencyKey.create({
        data: {
          key: `${session.user.id}:${idempotencyKey}`,
          method: "POST",
          path: "/api/admin/cardcom/refund",
          statusCode: 200,
          response: result,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[admin/cardcom/refund] failed", {
      transactionId: body.cardcomTransactionId,
      error: message,
    });
    return NextResponse.json({ message: `זיכוי נכשל: ${message}` }, { status: 502 });
  }
}
