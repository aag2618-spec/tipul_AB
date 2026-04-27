// src/app/api/payments/[id]/cardcom-transaction/route.ts
// מחזיר את פרטי עסקת ה-Cardcom האחרונה של ה-Payment עבור המטפל המחובר.
// משמש את ה-UI של היסטוריית התשלומים: אייקון שיטה (💳), כפתור "פרטי עסקה",
// וכפתור "ביטול/זיכוי" (זמין רק עד 14 יום מהאישור).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const REFUND_WINDOW_DAYS = 14;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const { id: paymentId } = await context.params;

  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        client: { select: { id: true, therapistId: true } },
      },
    });
    if (!payment) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }
    if (payment.client.therapistId !== userId) {
      return NextResponse.json({ message: "אין הרשאה לתשלום זה" }, { status: 403 });
    }

    // ⚠️ Selection priority is critical when a Payment has multiple Cardcom
    // rows (rare: e.g. a failed attempt followed by a successful one).
    // We MUST prefer terminal "money rows" (APPROVED/REFUNDED) over PENDING
    // /DECLINED/FAILED, otherwise the panel will show stale info and the
    // refund window calculation could anchor on the wrong row.
    // Strategy: query latest APPROVED-or-REFUNDED first; fall back to the
    // most recent of any status only if none exists (e.g. mid-flow).
    const SELECT = {
      id: true,
      status: true,
      amount: true,
      currency: true,
      numOfPayments: true,
      cardLast4: true,
      cardHolder: true,
      cardBrand: true,
      approvalNumber: true,
      transactionId: true,
      refundedAmount: true,
      completedAt: true,
      createdAt: true,
      errorCode: true,
      errorMessage: true,
    } as const;
    let tx = await prisma.cardcomTransaction.findFirst({
      where: {
        paymentId: payment.id,
        tenant: "USER",
        userId,
        status: { in: ["APPROVED", "REFUNDED"] },
      },
      orderBy: { createdAt: "desc" },
      select: SELECT,
    });
    if (!tx) {
      tx = await prisma.cardcomTransaction.findFirst({
        where: { paymentId: payment.id, tenant: "USER", userId },
        orderBy: { createdAt: "desc" },
        select: SELECT,
      });
    }

    if (!tx) {
      return NextResponse.json({ tx: null });
    }

    const amountNum = Number(tx.amount);
    const refundedNum = Number(tx.refundedAmount);
    const remaining = Math.max(0, amountNum - refundedNum);
    const approvedAt = tx.completedAt ?? tx.createdAt;
    const ageMs = Date.now() - new Date(approvedAt).getTime();
    const inRefundWindow = ageMs <= REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const refundable =
      tx.status === "APPROVED" && remaining > 0 && inRefundWindow;
    const daysSinceApproval = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    const refundDaysLeft = Math.max(0, REFUND_WINDOW_DAYS - daysSinceApproval);

    return NextResponse.json({
      tx: {
        id: tx.id,
        status: tx.status,
        amount: amountNum,
        refundedAmount: refundedNum,
        remainingAmount: remaining,
        currency: tx.currency,
        numOfPayments: tx.numOfPayments,
        cardLast4: tx.cardLast4,
        cardHolder: tx.cardHolder,
        cardBrand: tx.cardBrand,
        approvalNumber: tx.approvalNumber,
        cardcomTransactionId: tx.transactionId,
        completedAt: tx.completedAt,
        createdAt: tx.createdAt,
        errorCode: tx.errorCode,
        errorMessage: tx.errorMessage,
      },
      refund: {
        refundable,
        windowDays: REFUND_WINDOW_DAYS,
        daysLeft: refundDaysLeft,
        reason: !refundable
          ? tx.status !== "APPROVED"
            ? `סטטוס העסקה: ${tx.status}`
            : remaining <= 0
              ? "כבר הוחזר במלואו"
              : !inRefundWindow
                ? `חלף חלון הזיכוי (${REFUND_WINDOW_DAYS} ימים)`
                : null
          : null,
      },
    });
  } catch (err) {
    logger.error("[payments/cardcom-transaction] failed", {
      paymentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: "שגיאה בטעינת פרטי העסקה" }, { status: 500 });
  }
}
