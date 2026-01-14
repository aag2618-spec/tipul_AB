import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "לא מורשה" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const userId = searchParams.get("userId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;

    const [payments, total, stats] = await Promise.all([
      prisma.subscriptionPayment.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.subscriptionPayment.count({ where }),
      prisma.subscriptionPayment.groupBy({
        by: ["status"],
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    // Calculate totals
    const totalRevenue = stats
      .filter((s) => s.status === "PAID")
      .reduce((sum, s) => sum + Number(s._sum.amount || 0), 0);

    const pendingAmount = stats
      .filter((s) => s.status === "PENDING")
      .reduce((sum, s) => sum + Number(s._sum.amount || 0), 0);

    const overdueAmount = stats
      .filter((s) => s.status === "OVERDUE")
      .reduce((sum, s) => sum + Number(s._sum.amount || 0), 0);

    return NextResponse.json({
      payments,
      total,
      stats: {
        totalRevenue,
        pendingAmount,
        overdueAmount,
        byStatus: stats,
      },
    });
  } catch (error) {
    console.error("Get billing error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת נתוני התשלומים" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "לא מורשה" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, amount, description, periodStart, periodEnd, status } = body;

    if (!userId || !amount) {
      return NextResponse.json(
        { message: "נא למלא משתמש וסכום" },
        { status: 400 }
      );
    }

    const payment = await prisma.subscriptionPayment.create({
      data: {
        userId,
        amount,
        description,
        periodStart: periodStart ? new Date(periodStart) : null,
        periodEnd: periodEnd ? new Date(periodEnd) : null,
        status: status || "PENDING",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("Create payment error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת התשלום" },
      { status: 500 }
    );
  }
}
