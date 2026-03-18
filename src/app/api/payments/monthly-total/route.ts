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

    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get("start");
    
    // ברירת מחדל - תחילת החודש הנוכחי
    const startDate = startParam 
      ? new Date(startParam) 
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // סוף החודש
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59, 999);

    // מצא את כל התשלומים ששולמו בטווח התאריכים
    // כולל תשלומים שה-paidAt שלהם null אבל createdAt בטווח
    const payments = await prisma.payment.findMany({
      where: {
        client: { therapistId: userId },
        status: "PAID",
        parentPaymentId: null,
        OR: [
          {
            paidAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          {
            paidAt: null,
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        ],
      },
      select: {
        amount: true,
        expectedAmount: true,
      },
    });

    // סנן רק תשלומים שמולאו במלואם (כמו paid-history)
    const fullyPaid = payments.filter((p) => {
      const amount = Number(p.amount);
      const expected = p.expectedAmount ? Number(p.expectedAmount) : amount;
      return amount >= expected;
    });

    // חישוב סה"כ
    const total = fullyPaid.reduce((sum, p) => sum + Number(p.amount), 0);

    return NextResponse.json({ 
      total,
      count: fullyPaid.length,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
  } catch (error) {
    logger.error("Get monthly total error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת נתונים" },
      { status: 500 }
    );
  }
}
