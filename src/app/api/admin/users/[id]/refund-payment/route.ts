// src/app/api/admin/users/[id]/refund-payment/route.ts
// Stage 6 — אדמין מבצע refund על SubscriptionPayment APPROVED.
//
// זרימה:
//   1. requirePermission("payments.refund") — ADMIN בלבד
//   2. parseBody: { subscriptionPaymentId, amount?, reason }
//   3. שליפת SubscriptionPayment + CardcomTransaction.APPROVED
//   4. validateRefundPayment (status, window, remaining)
//   5. CardcomClient.refundTransaction (idempotent עם uniqueAsmachta)
//   6. עדכון CardcomTransaction.refundedAmount + SubscriptionPayment.status=REFUNDED
//      (אם refund מלא)
//   7. withAudit (action="refund_payment")

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { withAudit } from "@/lib/audit";
import { getAdminCardcomClient } from "@/lib/cardcom/admin-config";
import { scrubCardcomMessage } from "@/lib/cardcom/verify-webhook";
import {
  validateRefundPayment,
  calculateRefundableAmount,
} from "@/lib/payments/admin-payment-actions";
import {
  checkRateLimit,
  SUBSCRIPTION_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const refundSchema = z.object({
  subscriptionPaymentId: z.string().min(1).max(64),
  amount: z.number().positive().optional(), // אם null/missing — refund מלא של היתרה
  reason: z.string().min(1).max(500),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("payments.refund");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    // Rate limit על האדמין — refund הוא destructive, 5/שעה מספיק לפעולות
    // legitimate. סוכן אבטחה ממצא #3.
    const rateCheck = checkRateLimit(
      `admin_refund:${session.user.id}`,
      SUBSCRIPTION_RATE_LIMIT
    );
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck);

    const { id: targetUserId } = await params;

    const parsed = await parseBody(request, refundSchema);
    if ("error" in parsed) return parsed.error;
    const { subscriptionPaymentId, amount, reason } = parsed.data;

    // שליפת SubscriptionPayment עם CardcomTransaction APPROVED משויך.
    // העדפנו עסקה APPROVED עם transactionId — refund דרך Cardcom דורש את ה-id.
    const sp = await prisma.subscriptionPayment.findUnique({
      where: { id: subscriptionPaymentId },
      include: {
        cardcomTransactions: {
          where: { status: "APPROVED", transactionId: { not: null } },
          orderBy: { completedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!sp) {
      return NextResponse.json(
        { message: "תשלום לא נמצא" },
        { status: 404 }
      );
    }
    if (sp.userId !== targetUserId) {
      // IDOR protection — לוודא שה-SP שייך ל-target.
      logger.warn("[admin/refund-payment] SP does not belong to target user", {
        spUserId: sp.userId,
        targetUserId,
        actor: session.user.id,
      });
      return NextResponse.json(
        { message: "התשלום אינו שייך למשתמש זה" },
        { status: 400 }
      );
    }
    const ct = sp.cardcomTransactions[0];
    if (!ct) {
      return NextResponse.json(
        {
          message:
            "לא נמצאה CardcomTransaction APPROVED עבור התשלום. אם זה תשלום ידני (MANUAL), יש לסמן אותו ב-DB ישירות.",
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const remaining = calculateRefundableAmount({
      amount: Number(ct.amount),
      refundedAmount: Number(ct.refundedAmount),
    });
    const refundAmount = amount ?? remaining;

    const validation = validateRefundPayment({
      cardcomTransaction: {
        status: ct.status,
        amount: Number(ct.amount),
        refundedAmount: Number(ct.refundedAmount),
        completedAt: ct.completedAt,
        transactionId: ct.transactionId,
      },
      refundAmount,
      now,
    });
    if (!validation.allowed) {
      return NextResponse.json({ message: validation.reason }, { status: 400 });
    }

    // === שלב 1: CAS-based reservation + SELECT FOR UPDATE (סוכן אבטחה #1+#2) ===
    // לפני קריאה ל-Cardcom, מעדכנים את refundedAmount באופן אטומי בעזרת
    // optimistic concurrency control: updateMany עם where על refundedAmount הקיים.
    // אם 2 admins מקבילים — רק אחד מהם יקבל count=1; השני יקבל 0 ויחזיר 409.
    // זה מבטיח שלא יבוצעו 2 קריאות Cardcom על אותה עסקה.
    const newRefundedAmount = Number(ct.refundedAmount) + refundAmount;
    const isFullRefund = newRefundedAmount >= Number(ct.amount);

    const reservation = await prisma.cardcomTransaction.updateMany({
      where: {
        id: ct.id,
        refundedAmount: ct.refundedAmount, // CAS — אם השתנה ע"י admin מקביל, אל תיגע
        status: "APPROVED",
      },
      data: {
        refundedAmount: newRefundedAmount,
      },
    });
    if (reservation.count === 0) {
      logger.warn(
        "[admin/refund-payment] CAS failed — concurrent refund detected",
        {
          cardcomTransactionId: ct.id,
          actor: session.user.id,
        }
      );
      return NextResponse.json(
        {
          message:
            "פעולת refund אחרת בוצעה במקביל. רענן/י את הדף וודא/י את היתרה הזמינה.",
        },
        { status: 409 }
      );
    }

    // === שלב 2: ביצוע refund ב-Cardcom ===
    // uniqueAsmachta דטרמיניסטי — `refund-${ct.id}-${newRefundedAmount}` —
    // כך ש-double-click או network retry שמגיעים עם אותו state יקבלו אותו
    // asmachta, ו-Cardcom יזהה את הכפילות. סוכן קוד+אבטחה ממצא #1.
    const refundIdempotencyKey = `refund-${ct.id}-${newRefundedAmount}`;
    let cardcomRefundResult;
    try {
      const cardcomClient = await getAdminCardcomClient();
      cardcomRefundResult = await cardcomClient.refundTransaction({
        transactionId: ct.transactionId!,
        amount: refundAmount,
        reason,
        uniqueAsmachta: refundIdempotencyKey,
      });
      if (cardcomRefundResult.responseCode !== "0") {
        throw new Error(
          `Cardcom refund failed: ${cardcomRefundResult.errorMessage ?? "unknown"}`
        );
      }
    } catch (refundErr) {
      const msg =
        refundErr instanceof Error ? refundErr.message : String(refundErr);
      const scrubbed = scrubCardcomMessage(msg) ?? "unknown error";
      logger.error("[admin/refund-payment] Cardcom refund failed", {
        cardcomTransactionId: ct.id,
        actor: session.user.id,
        error: scrubbed,
      });
      // ROLLBACK ה-reservation — refundedAmount חזרה ל-old.
      // משתמשים ב-updateMany עם CAS על הערך החדש (newRefundedAmount) כדי לא
      // לבטל reservation של admin אחר שנכנס אחרי הכישלון.
      try {
        await prisma.cardcomTransaction.updateMany({
          where: { id: ct.id, refundedAmount: newRefundedAmount },
          data: { refundedAmount: ct.refundedAmount },
        });
      } catch (rollbackErr) {
        // אם rollback נכשל — alert ל-admin (refundedAmount נמצא במצב לא עקבי).
        logger.error("[admin/refund-payment] CRITICAL: rollback failed", {
          cardcomTransactionId: ct.id,
          error:
            rollbackErr instanceof Error
              ? rollbackErr.message
              : String(rollbackErr),
        });
      }
      return NextResponse.json(
        {
          message: `Cardcom refund נכשל: ${scrubbed}. הכסף לא הוחזר.`,
        },
        { status: 502 }
      );
    }

    // === שלב 3: השלמת DB updates + audit ב-tx אטומי ===
    // ה-refundedAmount כבר עודכן בשלב 1 (reservation). כעת מעדכנים status
    // ו-SubscriptionPayment.status אם זה refund מלא + יוצרים audit log.
    await withAudit(
      { kind: "user", session },
      {
        action: "refund_payment",
        targetType: "subscription_payment",
        targetId: sp.id,
        details: {
          cardcomTransactionId: ct.id,
          refundAmount,
          newRefundedAmount,
          isFullRefund,
          reason,
          refundIdempotencyKey,
          cardcomRefundId: cardcomRefundResult.refundId,
        },
      },
      async (tx) => {
        if (isFullRefund) {
          await tx.cardcomTransaction.update({
            where: { id: ct.id },
            data: { status: "REFUNDED" },
          });
          await tx.subscriptionPayment.update({
            where: { id: sp.id },
            data: { status: "REFUNDED" },
          });
        }
      }
    );

    logger.info("[admin/refund-payment] refund completed", {
      targetUserId,
      subscriptionPaymentId: sp.id,
      cardcomTransactionId: ct.id,
      refundAmount,
      isFullRefund,
      actor: session.user.id,
    });

    return NextResponse.json({
      success: true,
      refundAmount,
      newRefundedAmount,
      isFullRefund,
      cardcomRefundId: cardcomRefundResult.refundId,
      message: isFullRefund
        ? "התשלום הוחזר במלואו."
        : `הוחזר חלקי: ₪${refundAmount.toLocaleString("he-IL")} (סה"כ הוחזר: ₪${newRefundedAmount.toLocaleString("he-IL")}).`,
    });
  } catch (error) {
    logger.error("[admin/refund-payment] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בביצוע refund" },
      { status: 500 }
    );
  }
}
