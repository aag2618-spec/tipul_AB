import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get("start");
    
    // ברירת מחדל - תחילת החודש הנוכחי
    const startDate = startParam 
      ? new Date(startParam) 
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // סוף החודש
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59, 999);

    // מצא את כל התשלומים ששולמו בטווח התאריכים
    const payments = await prisma.payment.findMany({
      where: {
        client: { therapistId: session.user.id },
        status: "PAID",
        paidAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        amount: true,
      },
    });

    // חישוב סה"כ
    const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    return NextResponse.json({ 
      total,
      count: payments.length,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
  } catch (error) {
    console.error("Get monthly total error:", error);
    return NextResponse.json(
      { message: "שגיאה בטעינת נתונים" },
      { status: 500 }
    );
  }
}
