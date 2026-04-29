// src/app/api/payments/[id]/sync-cardcom-status/route.ts
//
// Manual sync trigger — when the Cardcom webhook is delayed/missing/blocked,
// the therapist can click "סנכרן עם Cardcom" in the dialog to pull canonical
// state directly via LowProfile/GetLpResult and update our DB.
//
// Same verification logic as the webhook handler:
//   • ResponseCode === "0"
//   • TranzactionId > 0
//   • TranzactionInfo.ApprovalNumber non-empty
// Without all three, we treat as not-yet-approved (keep PENDING). With all
// three, promote to APPROVED + flip Payment to PAID.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { getUserCardcomClient } from "@/lib/cardcom/user-config";
import type { CardcomWebhookPayload } from "@/lib/cardcom/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId, session } = auth;

  const { id: paymentId } = await context.params;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      client: { select: { therapistId: true } },
      cardcomTransactions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, lowProfileId: true },
      },
    },
  });
  if (!payment || payment.client.therapistId !== userId) {
    return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
  }

  const tx = payment.cardcomTransactions[0];
  if (!tx) {
    return NextResponse.json(
      { message: "אין עסקה מקושרת — צרי קישור תשלום חדש" },
      { status: 404 }
    );
  }
  if (!tx.lowProfileId) {
    return NextResponse.json(
      { message: "העסקה עוד לא נשלחה ל-Cardcom — נסי שוב בעוד רגע" },
      { status: 409 }
    );
  }

  // Already settled — nothing to sync.
  if (tx.status === "APPROVED") {
    return NextResponse.json({ status: "APPROVED", payment: { status: payment.status } });
  }
  if (tx.status === "CANCELLED") {
    return NextResponse.json({ status: "CANCELLED", payment: { status: payment.status } });
  }

  const cardcomClient = await getUserCardcomClient(userId);
  if (!cardcomClient) {
    return NextResponse.json(
      { message: "מסוף Cardcom לא מוגדר — חברי בהגדרות אינטגרציות חיוב" },
      { status: 400 }
    );
  }

  let fetched: (CardcomWebhookPayload & { ResponseCode?: number | string }) | null;
  try {
    fetched = (await cardcomClient.getLpResult(tx.lowProfileId)) as
      | (CardcomWebhookPayload & { ResponseCode?: number | string })
      | null;
  } catch (err) {
    logger.error("[payments/sync-cardcom-status] GetLpResult failed", {
      userId,
      paymentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאת תקשורת עם Cardcom — נסי שוב בעוד רגע" },
      { status: 502 }
    );
  }

  if (!fetched || fetched.LowProfileId !== tx.lowProfileId) {
    return NextResponse.json(
      { message: "Cardcom החזיר נתונים לא תואמים" },
      { status: 502 }
    );
  }

  // Same three-part success criterion as the webhook (kept in sync).
  const responseCode = String(fetched.ResponseCode ?? "");
  const tranzactionIdNum = Number(fetched.TranzactionId ?? 0);
  const approvalNumber = fetched.TranzactionInfo?.ApprovalNumber ?? "";
  const success =
    responseCode === "0" && tranzactionIdNum > 0 && !!approvalNumber.trim();

  if (!success) {
    // Still pending or declined — don't mutate yet, just report current state.
    return NextResponse.json({
      status: "PENDING",
      cardcomResponseCode: responseCode,
      hasTranzactionId: tranzactionIdNum > 0,
      hasApprovalNumber: !!approvalNumber.trim(),
    });
  }

  // Promote both rows atomically inside withAudit so the operation appears
  // in the audit log alongside other Cardcom mutations.
  await withAudit(
    { kind: "user", session },
    {
      action: "cardcom_user_manual_sync",
      targetType: "payment",
      targetId: paymentId,
      details: {
        transactionId: tx.id,
        cardcomTranzactionId: tranzactionIdNum,
        approvalNumber,
      },
    },
    async (atx) => {
      await atx.cardcomTransaction.update({
        where: { id: tx.id },
        data: {
          status: "APPROVED",
          transactionId: String(tranzactionIdNum),
          approvalNumber,
          completedAt: new Date(),
          rawResponse: fetched as object,
        },
      });
      await atx.payment.update({
        where: { id: paymentId },
        data: {
          status: "PAID",
          paidAt: new Date(),
          method: "CREDIT_CARD",
        },
      });
      // Reopen tasks for this payment if they were marked completed by the
      // buggy cron — in this case the actual payment did succeed, so they
      // should stay completed. (Idempotent: only flips PENDING/IN_PROGRESS,
      // not COMPLETED.)
      await atx.task.updateMany({
        where: {
          relatedEntityId: paymentId,
          type: "COLLECT_PAYMENT",
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        data: { status: "COMPLETED" },
      });
    }
  );

  logger.info("[payments/sync-cardcom-status] manual sync promoted to PAID", {
    userId,
    paymentId,
    cardcomTranzactionId: tranzactionIdNum,
  });

  return NextResponse.json({
    status: "APPROVED",
    payment: { status: "PAID" },
  });
}
