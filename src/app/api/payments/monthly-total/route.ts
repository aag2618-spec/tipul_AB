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

    // שליפת כל התשלומים ששולמו במלואם (אותה גישה כמו הגרף)
    // וסינון לפי חודש בזמן ישראל - מונע בעיות timezone/DST
    const payments = await prisma.payment.findMany({
      where: {
        client: { therapistId: userId },
        status: "PAID",
        parentPaymentId: null,
      },
      select: {
        amount: true,
        expectedAmount: true,
        paidAt: true,
        createdAt: true,
      },
    });

    // חישוב החודש הנוכחי בזמן ישראל
    const israelNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    const israelYear = israelNow.getFullYear();
    const israelMonth = israelNow.getMonth();

    // סינון לחודש הנוכחי (בזמן ישראל) + רק תשלומים שמולאו במלואם
    const thisMonthPaid = payments.filter((p) => {
      const amount = Number(p.amount);
      const expected = p.expectedAmount ? Number(p.expectedAmount) : amount;
      if (amount < expected) return false;

      const paymentDate = p.paidAt || p.createdAt;
      const israelDate = new Date(paymentDate.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
      return israelDate.getFullYear() === israelYear && israelDate.getMonth() === israelMonth;
    });

    const total = thisMonthPaid.reduce((sum, p) => sum + Number(p.amount), 0);

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
