import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/payments/history?clientId=xxx
 * Returns payment history for a specific client
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json(
        { message: "חסר מזהה מטופל" },
        { status: 400 }
      );
    }

    // Verify client ownership
    const client = await prisma.client.findFirst({
      where: { id: clientId, therapistId: session.user.id },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // Get all paid payments for this client
    const payments = await prisma.payment.findMany({
      where: {
        clientId,
        status: "PAID",
      },
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        amount: true,
        method: true,
        paidAt: true,
        notes: true,
      },
    });

    // Convert to plain objects with numbers
    const paymentsData = payments.map((payment) => ({
      id: payment.id,
      amount: Number(payment.amount),
      method: payment.method,
      paidAt: payment.paidAt,
      notes: payment.notes,
    }));

    // Count unique paid sessions
    const paidSessionsCount = await prisma.payment.count({
      where: {
        clientId,
        status: "PAID",
        sessionId: { not: null },
      },
      distinct: ["sessionId"],
    });

    return NextResponse.json({
      payments: paymentsData,
      paidSessionsCount,
    });
  } catch (error) {
    console.error("Get payment history error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת היסטוריית תשלומים" },
      { status: 500 }
    );
  }
}
