// src/app/api/admin/users/[id]/financial/route.ts
// Stage 6 — GET endpoint לסקירה פיננסית מלאה של משתמש לאדמין.
//
// מחזיר:
//   - SubscriptionPayment[] (10 אחרונים) + CardcomTransaction האחרון (כל סטטוס) + invoice
//     CardcomTransaction נשלף כל-סטטוס כדי לאפשר sync ידני ל-SP במצב PENDING.
//   - UserPackagePurchase[] (20 אחרונים) + מי הזין
//   - CardcomTransaction[] (10 אחרונים, כולל FAILED/DECLINED — לצורך debug)
//
// הרשאה: users.view (MANAGER+); נתונים פיננסיים מפורטים — ADMIN בלבד.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { scrubCardcomMessage } from "@/lib/cardcom/verify-webhook";
import { calculateRefundableAmount } from "@/lib/payments/admin-payment-actions";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("users.view");
    if ("error" in auth) return auth.error;
    const { session } = auth;
    const isAdmin = session.user.role === "ADMIN";

    const { id: targetUserId } = await params;

    // Defense-in-depth: רק ADMIN רואה את הסקירה המלאה.
    if (!isAdmin) {
      return NextResponse.json(
        { message: "סקירה פיננסית מלאה זמינה לאדמין בלבד." },
        { status: 403 }
      );
    }

    const [subscriptionPayments, packagePurchases, cardcomTransactions] =
      await Promise.all([
        prisma.subscriptionPayment.findMany({
          where: { userId: targetUserId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            description: true,
            periodStart: true,
            periodEnd: true,
            paidAt: true,
            createdAt: true,
            planTier: true,
            autoChargeEnabled: true,
            chargeAttempts: true,
            lastChargeError: true,
            cardcomTransactions: {
              // כולל כל הסטטוסים כדי שיוצג גם ל-SP במצב PENDING (לאפשר sync).
              // כפתור החזר כספי עדיין מוגבל ב-UI ל-status=APPROVED בלבד.
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                status: true,
                amount: true,
                refundedAmount: true,
                completedAt: true,
                transactionId: true,
                cardLast4: true,
                lowProfileId: true,
              },
            },
            cardcomInvoices: {
              where: { tenant: "ADMIN" },
              orderBy: { issuedAt: "desc" },
              take: 1,
              select: { pdfUrl: true, cardcomDocumentNumber: true },
            },
          },
        }),
        prisma.userPackagePurchase.findMany({
          where: { userId: targetUserId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            type: true,
            credits: true,
            creditsUsed: true,
            note: true,
            source: true,
            externalId: true,
            reverted: true,
            revertedAt: true,
            createdAt: true,
            grantedByUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        }),
        prisma.cardcomTransaction.findMany({
          where: { userId: targetUserId, tenant: "ADMIN" },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            status: true,
            amount: true,
            refundedAmount: true,
            purpose: true,
            createdAt: true,
            completedAt: true,
            errorMessage: true,
            errorCode: true,
            cardLast4: true,
            transactionId: true,
          },
        }),
      ]);

    // serializaion — Decimal → number
    const serializedSp = subscriptionPayments.map((sp) => ({
      ...sp,
      amount: Number(sp.amount) || 0,
      paidAtIso: sp.paidAt?.toISOString() ?? null,
      periodStartIso: sp.periodStart?.toISOString() ?? null,
      periodEndIso: sp.periodEnd?.toISOString() ?? null,
      createdAtIso: sp.createdAt.toISOString(),
      cardcomTransaction: sp.cardcomTransactions[0]
        ? {
            id: sp.cardcomTransactions[0].id,
            status: sp.cardcomTransactions[0].status,
            amount: Number(sp.cardcomTransactions[0].amount) || 0,
            refundedAmount:
              Number(sp.cardcomTransactions[0].refundedAmount) || 0,
            refundableAmount: calculateRefundableAmount({
              amount: Number(sp.cardcomTransactions[0].amount) || 0,
              refundedAmount:
                Number(sp.cardcomTransactions[0].refundedAmount) || 0,
            }),
            completedAtIso:
              sp.cardcomTransactions[0].completedAt?.toISOString() ?? null,
            transactionId: sp.cardcomTransactions[0].transactionId,
            cardLast4: sp.cardcomTransactions[0].cardLast4,
            // נדרש לתצוגת כפתור "סנכרן מ-Cardcom" ב-UI כש-SP במצב PENDING.
            lowProfileId: sp.cardcomTransactions[0].lowProfileId,
          }
        : null,
      invoicePdfUrl: sp.cardcomInvoices[0]?.pdfUrl ?? null,
      invoiceDocNumber: sp.cardcomInvoices[0]?.cardcomDocumentNumber ?? null,
    }));

    const serializedPkg = packagePurchases.map((p) => ({
      ...p,
      createdAtIso: p.createdAt.toISOString(),
      revertedAtIso: p.revertedAt?.toISOString() ?? null,
    }));

    const serializedTx = cardcomTransactions.map((t) => ({
      ...t,
      amount: Number(t.amount) || 0,
      refundedAmount: Number(t.refundedAmount) || 0,
      createdAtIso: t.createdAt.toISOString(),
      completedAtIso: t.completedAt?.toISOString() ?? null,
      // סוכן אבטחה ממצא #5: scrub errorMessage כדי שלא נחשוף PAN/PII
      // שעלולים להגיע מ-Cardcom ל-clients (גם אם admin בלבד — defense-in-depth).
      // חיתוך ל-200 תווים — סוכן UX ממצא #7.
      errorMessage: t.errorMessage
        ? (scrubCardcomMessage(t.errorMessage) ?? "").substring(0, 200)
        : null,
    }));

    return NextResponse.json({
      subscriptionPayments: serializedSp,
      packagePurchases: serializedPkg,
      cardcomTransactions: serializedTx,
    });
  } catch (error) {
    logger.error("[admin/financial] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת סקירה פיננסית" },
      { status: 500 }
    );
  }
}
