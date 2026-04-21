import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getIsraelYear, getIsraelMonth } from "@/lib/date-utils";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    // שליפת תשלומים אמיתיים (ילדים חלקיים + הורים ללא ילדים)
    // מונע כפילות: הורה עם ילדים לא נספר כי הילדים כבר נספרים
    const payments = await prisma.payment.findMany({
      where: {
        client: { therapistId: userId },
        status: "PAID",
        OR: [
          { parentPaymentId: { not: null } },                        // ילדים (תשלומים חלקיים)
          { parentPaymentId: null, childPayments: { none: {} } },    // הורים ללא ילדים (תשלום מלא בודד)
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
    const monthsParam = Number(request.nextUrl.searchParams.get("months")) || 1;
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
