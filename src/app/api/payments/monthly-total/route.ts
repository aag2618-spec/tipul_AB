import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getIsraelYear, getIsraelMonth } from "@/lib/date-utils";

import { requireAuth } from "@/lib/api-auth";
import { buildPaymentWhere, loadScopeUser } from "@/lib/scope";
import { EXCLUDE_BULK_UMBRELLA_WHERE } from "@/lib/payments/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const scopeUser = await loadScopeUser(userId);
    const paymentWhere = buildPaymentWhere(scopeUser);

    // חלון זמן — רק החודשים שביקשו, לא כל ההיסטוריה
    const monthsParam = Math.min(Number(request.nextUrl.searchParams.get("months")) || 1, 24);
    const windowStart = new Date();
    windowStart.setDate(1);
    windowStart.setMonth(windowStart.getMonth() - monthsParam);
    windowStart.setHours(0, 0, 0, 0);

    const payments = await prisma.payment.findMany({
      where: {
        AND: [
          paymentWhere,
          EXCLUDE_BULK_UMBRELLA_WHERE,
          {
            status: "PAID",
            OR: [
              { parentPaymentId: { not: null } },
              { parentPaymentId: null, childPayments: { none: {} } },
            ],
          },
          {
            OR: [
              { paidAt: { gte: windowStart } },
              { paidAt: null, createdAt: { gte: windowStart } },
            ],
          },
        ],
      },
      select: {
        amount: true,
        paidAt: true,
        createdAt: true,
      },
    });

    // חישוב החודש הנוכחי בזמן ישראל — דרך date-utils (DST-aware)
    const now = new Date();
    const israelYear = getIsraelYear(now);
    const israelMonth = getIsraelMonth(now); // 1-12

    // סינון לחודש הנוכחי (בזמן ישראל)
    const thisMonthPaid = payments.filter((p) => {
      const paymentDate = p.paidAt || p.createdAt;
      return (
        getIsraelYear(paymentDate) === israelYear &&
        getIsraelMonth(paymentDate) === israelMonth
      );
    });

    const total = thisMonthPaid.reduce((sum, p) => sum + Number(p.amount), 0);

    // פירוט לפי חודשים (לגרף) - אם מבקשים months > 1
    if (monthsParam > 1) {
      const breakdown = [];
      // חישוב חודשים אחורה לפי שעון ישראל — israelMonth הוא 1-12
      for (let i = monthsParam - 1; i >= 0; i--) {
        // נרמול חודש (0-11) לחישוב, חזרה ל-(1-12) לתצוגה
        const targetMonthZeroIdx = israelMonth - 1 - i;
        const yearOffset = Math.floor(targetMonthZeroIdx / 12);
        const tMonth1to12 = ((targetMonthZeroIdx % 12) + 12) % 12 + 1;
        const tYear = israelYear + yearOffset;

        const monthPaid = payments.filter((p) => {
          const paymentDate = p.paidAt || p.createdAt;
          return (
            getIsraelYear(paymentDate) === tYear &&
            getIsraelMonth(paymentDate) === tMonth1to12
          );
        });

        const monthTotal = monthPaid.reduce((sum, p) => sum + Number(p.amount), 0);
        const key = `${tYear}-${String(tMonth1to12).padStart(2, "0")}`;
        breakdown.push({ month: key, total: monthTotal, count: monthPaid.length });
      }

      return NextResponse.json({ total, count: thisMonthPaid.length, breakdown });
    }

    return NextResponse.json({
      total,
      count: thisMonthPaid.length,
    });
  } catch (error) {
    logger.error("Get monthly total error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת נתונים" },
      { status: 500 }
    );
  }
}
