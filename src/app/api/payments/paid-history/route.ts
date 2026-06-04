import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { buildPaymentWhere, loadScopeUser } from "@/lib/scope";
import { shouldScopePersonal } from "@/lib/view-scope";
import { EXCLUDE_BULK_UMBRELLA_WHERE } from "@/lib/payments/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const scopeUser = await loadScopeUser(userId);
    const personalOnly = await shouldScopePersonal(scopeUser);
    const paymentWhere = buildPaymentWhere(scopeUser, { personalOnly });

    const url = request.nextUrl;
    const take = Math.min(Number(url.searchParams.get("take")) || 50, 200);
    const skip = Math.max(0, Math.min(Number(url.searchParams.get("skip")) || 0, 10000));

    // ── סינון חודש ב-server-side (תיקון רגרסיה מ-e8f53d72) ──
    // לפני: ה-UI היה שולף 50 תשלומים אחרונים ומסנן בזיכרון לפי חודש,
    // מה שגרם ל"לא נמצאו תשלומים" כשהחודש המבוקש בכלל לא נטען עדיין
    // (יותר מ-50 תשלומים אחריו). עכשיו: ?month=YYYY-MM מסנן בשאילתה.
    const monthParam = url.searchParams.get("month");
    let monthRange: { gte: Date; lt: Date } | null = null;
    if (monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) {
      const [yearStr, mStr] = monthParam.split("-");
      const year = Number(yearStr);
      const month = Number(mStr) - 1; // JS months are 0-indexed
      const gte = new Date(year, month, 1);
      const lt = new Date(year, month + 1, 1);
      monthRange = { gte, lt };
    }

    const payments = await prisma.payment.findMany({
      where: {
        AND: [
          paymentWhere,
          EXCLUDE_BULK_UMBRELLA_WHERE,
          { status: "PAID", parentPaymentId: null },
          // paidAt עיקר ולעיתים null (legacy) — fallback ל-createdAt.
          // משתמשים ב-OR כדי לתפוס את שניהם.
          ...(monthRange
            ? [
                {
                  OR: [
                    { paidAt: { gte: monthRange.gte, lt: monthRange.lt } },
                    {
                      AND: [
                        { paidAt: null },
                        { createdAt: { gte: monthRange.gte, lt: monthRange.lt } },
                      ],
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      take: take + 1,
      skip,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            therapist: { select: { id: true, name: true } },
          },
        },
        session: {
          select: {
            id: true,
            startTime: true,
            type: true,
          },
        },
        childPayments: {
          select: {
            id: true,
            amount: true,
            method: true,
            paidAt: true,
            createdAt: true,
            receiptNumber: true,
            receiptUrl: true,
            hasReceipt: true,
          },
          orderBy: { paidAt: "asc" },
        },
      },
      orderBy: {
        paidAt: "desc",
      },
    });

    const hasMore = payments.length > take;
    const trimmed = hasMore ? payments.slice(0, take) : payments;

    const fullyPaidPayments = trimmed.filter((payment) => {
      const amount = Number(payment.amount);
      const expectedAmount = payment.expectedAmount ? Number(payment.expectedAmount) : amount;
      return amount >= expectedAmount;
    });

    // המרה לפורמט הנדרש - כולל כל הנתונים ל-PaymentHistoryItem
    const result = fullyPaidPayments.map((payment) => {
      const firstChildWithReceipt = payment.childPayments?.find((c) => c.hasReceipt);
      const receiptNumber = payment.receiptNumber || firstChildWithReceipt?.receiptNumber || null;
      const receiptUrl = payment.receiptUrl || firstChildWithReceipt?.receiptUrl || null;
      const hasReceipt = payment.hasReceipt || !!firstChildWithReceipt?.hasReceipt;

      return {
        id: payment.id,
        clientId: payment.client.id,
        clientName: payment.client.firstName && payment.client.lastName
          ? `${payment.client.firstName} ${payment.client.lastName}`
          : payment.client.name,
        therapistId: payment.client.therapist?.id ?? null,
        therapistName: payment.client.therapist?.name ?? null,
        amount: Number(payment.amount),
        expectedAmount: payment.expectedAmount ? Number(payment.expectedAmount) : Number(payment.amount),
        method: payment.method,
        status: payment.status,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
        receiptNumber,
        receiptUrl,
        hasReceipt,
        session: payment.session ? {
          id: payment.session.id,
          startTime: payment.session.startTime,
          type: payment.session.type,
        } : null,
        childPayments: payment.childPayments?.map((child) => ({
          id: child.id,
          amount: Number(child.amount),
          method: child.method || payment.method,
          paidAt: child.paidAt,
          createdAt: child.createdAt,
        })) || [],
      };
    });

    return NextResponse.json({ items: result, hasMore, nextSkip: skip + trimmed.length });
  } catch (error) {
    logger.error("Get paid history error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת היסטוריית התשלומים" },
      { status: 500 }
    );
  }
}
