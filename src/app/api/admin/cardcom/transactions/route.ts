// src/app/api/admin/cardcom/transactions/route.ts
// GET רשימת עסקאות Cardcom של ADMIN, עם סינון לפי מטפל / סטטוס / תאריך.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import type { CardcomTxStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const auth = await requirePermission("billing.cardcom.view_transactions");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const status = searchParams.get("status") as CardcomTxStatus | null;
  const fromDate = searchParams.get("fromDate");
  const toDate = searchParams.get("toDate");
  const cursor = searchParams.get("cursor");

  const where: Prisma.CardcomTransactionWhereInput = { tenant: "ADMIN" };
  if (userId) where.userId = userId;
  if (status) where.status = status;
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) {
      const d = new Date(fromDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ message: "fromDate לא תקין" }, { status: 400 });
      }
      where.createdAt.gte = d;
    }
    if (toDate) {
      const d = new Date(toDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ message: "toDate לא תקין" }, { status: 400 });
      }
      where.createdAt.lte = d;
    }
  }

  try {
    const transactions = await prisma.cardcomTransaction.findMany({
      where,
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        subscriptionPayment: { select: { id: true, periodStart: true, periodEnd: true } },
      },
    });

    const hasMore = transactions.length > PAGE_SIZE;
    const items = hasMore ? transactions.slice(0, PAGE_SIZE) : transactions;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return NextResponse.json({
      items: items.map((t) => ({
        id: t.id,
        tenant: t.tenant,
        userId: t.userId,
        userName: t.user?.name ?? null,
        userEmail: t.user?.email ?? null,
        subscriptionPaymentId: t.subscriptionPaymentId,
        amount: Number(t.amount) || 0,
        currency: t.currency,
        status: t.status,
        cardLast4: t.cardLast4,
        cardHolder: t.cardHolder,
        approvalNumber: t.approvalNumber,
        errorCode: t.errorCode,
        errorMessage: t.errorMessage,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt?.toISOString() ?? null,
      })),
      nextCursor,
    });
  } catch (err) {
    logger.error("[admin/cardcom/transactions] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת רשימת העסקאות" },
      { status: 500 }
    );
  }
}
