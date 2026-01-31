import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

    const { clientId } = await params;

    // Get client with unpaid sessions
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        therapistId: session.user.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        creditBalance: true,
      },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // Get all unpaid or partially paid sessions
    const allPayments = await prisma.payment.findMany({
      where: {
        clientId,
        status: "PENDING",
      },
      orderBy: {
        createdAt: "asc", // Oldest first - pay in order
      },
      select: {
        id: true,
        sessionId: true,
        createdAt: true,
        amount: true,
        expectedAmount: true,
        status: true,
      },
    });

    // Filter to only include payments where amount < expectedAmount
    const unpaidPayments = allPayments.filter(
      payment => Number(payment.amount) < Number(payment.expectedAmount)
    );

    // Calculate total debt
    const totalDebt = unpaidPayments.reduce(
      (sum, payment) => sum + (Number(payment.expectedAmount) - Number(payment.amount)),
      0
    );

    const result = {
      id: client.id,
      name: client.name,
      email: client.email,
      creditBalance: Number(client.creditBalance),
      totalDebt,
      unpaidSessions: unpaidPayments.map(payment => ({
        paymentId: payment.id,
        sessionId: payment.sessionId,
        date: payment.createdAt,
        amount: Number(payment.amount),
        expectedAmount: Number(payment.expectedAmount),
        status: payment.status,
      })),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get client debt error:", error);
    return NextResponse.json(
      { message: "שגיאה בטעינת נתונים" },
      { status: 500 }
    );
  }
}
