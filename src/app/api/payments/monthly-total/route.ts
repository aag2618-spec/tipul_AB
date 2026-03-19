import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

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

    // חישוב החודש הנוכחי בזמן ישראל
    const israelNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    const israelYear = israelNow.getFullYear();
    const israelMonth = israelNow.getMonth();

    // סינון לחודש הנוכחי (בזמן ישראל)
    const thisMonthPaid = payments.filter((p) => {
      const paymentDate = p.paidAt || p.createdAt;
      const israelDate = new Date(paymentDate.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
      return israelDate.getFullYear() === israelYear && israelDate.getMonth() === israelMonth;
    });

    const total = thisMonthPaid.reduce((sum, p) => sum + Number(p.amount), 0);

    // פירוט לפי חודשים (לגרף) - אם מבקשים months > 1
    const monthsParam = Number(request.nextUrl.searchParams.get("months")) || 1;
    if (monthsParam > 1) {
      const breakdown = [];
      for (let i = monthsParam - 1; i >= 0; i--) {
        const targetDate = new Date(israelYear, israelMonth - i, 1);
        const tYear = targetDate.getFullYear();
        const tMonth = targetDate.getMonth();

        const monthPaid = payments.filter((p) => {
          const paymentDate = p.paidAt || p.createdAt;
          const d = new Date(paymentDate.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
          return d.getFullYear() === tYear && d.getMonth() === tMonth;
        });

        const monthTotal = monthPaid.reduce((sum, p) => sum + Number(p.amount), 0);
        const key = `${tYear}-${String(tMonth + 1).padStart(2, "0")}`;
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
