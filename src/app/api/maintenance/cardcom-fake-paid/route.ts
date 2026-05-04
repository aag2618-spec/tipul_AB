// src/app/api/maintenance/cardcom-fake-paid/route.ts
//
// One-shot cleanup: identify Payments that were promoted to PAID by the buggy
// fix-stuck-payments cron (or bulk-payment.autoFixStuckPayments) WITHOUT any
// real Cardcom charge backing them.
//
// Identity criteria (all must hold):
//   • Payment.status = 'PAID'
//   • Payment.method = 'CREDIT_CARD'
//   • Payment.parentPaymentId = NULL (only parents — children are real receipts)
//   • No related CardcomTransaction with status=APPROVED AND non-null transactionId
//     (the bank's approved-charge signal — Cardcom-side proof a real charge exists).
//
// GET  → preview: returns the affected rows without modifying anything.
// POST → revert: flips them back to PENDING + clears paidAt + reopens
//        COLLECT_PAYMENT tasks. Per-therapist scoped.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import {
  buildPaymentWhere,
  isSecretary,
  loadScopeUser,
  secretaryCan,
  type ScopeUser,
} from "@/lib/scope";

export const dynamic = "force-dynamic";

async function findFakePaid(scopeUser: ScopeUser) {
  const paymentWhere = buildPaymentWhere(scopeUser);
  // Pull all CREDIT_CARD parent Payments accessible to this user that are
  // currently PAID. Then verify each has a real Cardcom transaction backing
  // it; the ones without are the corruption candidates.
  const candidates = await prisma.payment.findMany({
    where: {
      AND: [
        paymentWhere,
        {
          status: "PAID",
          method: "CREDIT_CARD",
          parentPaymentId: null,
        },
      ],
    },
    include: {
      client: { select: { id: true, name: true } },
      session: { select: { id: true, startTime: true } },
      cardcomTransactions: {
        select: { id: true, status: true, transactionId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { paidAt: "desc" },
  });

  return candidates.filter((p) => {
    const realCharge = p.cardcomTransactions.find(
      (t) => t.status === "APPROVED" && !!t.transactionId
    );
    return !realCharge;
  });
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    // route תחזוקה — מציג תשלומים. מזכירה ללא canViewPayments חסומה.
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewPayments")) {
      return NextResponse.json(
        { message: "אין הרשאה לצפייה בתשלומים" },
        { status: 403 }
      );
    }

    const fake = await findFakePaid(scopeUser);
    return NextResponse.json({
      count: fake.length,
      payments: serializePrisma(
        fake.map((p) => ({
          id: p.id,
          amount: p.amount,
          paidAt: p.paidAt,
          createdAt: p.createdAt,
          client: p.client,
          session: p.session,
          cardcomTransactionsCount: p.cardcomTransactions.length,
          // For diagnostic display — show the latest tx status (likely PENDING,
          // CANCELLED, or FAILED) so the therapist can see why we identified it.
          latestCardcomStatus: p.cardcomTransactions[0]?.status ?? "none",
        }))
      ),
    });
  } catch (error) {
    logger.error("[maintenance/cardcom-fake-paid] GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה באיתור תשלומים מזויפים" },
      { status: 500 }
    );
  }
}

export async function POST(_request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    // mutation — מזכירה צריכה לפחות canViewPayments כדי להריץ את התיקון.
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewPayments")) {
      return NextResponse.json(
        { message: "אין הרשאה לתיקון תשלומים" },
        { status: 403 }
      );
    }
    const paymentWhere = buildPaymentWhere(scopeUser);

    const fake = await findFakePaid(scopeUser);
    if (fake.length === 0) {
      return NextResponse.json({ count: 0, reverted: [] });
    }

    const ids = fake.map((p) => p.id);

    // Atomic revert + reopen tasks.
    await prisma.$transaction([
      prisma.payment.updateMany({
        where: {
          AND: [
            paymentWhere,
            {
              id: { in: ids },
              status: "PAID",
              method: "CREDIT_CARD",
            },
          ],
        },
        data: { status: "PENDING", paidAt: null },
      }),
      prisma.task.updateMany({
        where: {
          relatedEntityId: { in: ids },
          type: "COLLECT_PAYMENT",
          status: "COMPLETED",
        },
        data: { status: "PENDING" },
      }),
    ]);

    logger.info("[maintenance/cardcom-fake-paid] reverted fake-PAID Payments", {
      userId,
      count: ids.length,
    });

    return NextResponse.json({
      count: ids.length,
      reverted: serializePrisma(
        fake.map((p) => ({
          id: p.id,
          amount: p.amount,
          client: p.client,
          session: p.session,
        }))
      ),
    });
  } catch (error) {
    logger.error("[maintenance/cardcom-fake-paid] POST failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בתיקון תשלומים מזויפים" },
      { status: 500 }
    );
  }
}
