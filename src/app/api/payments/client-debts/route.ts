import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/payments/client-debts
 * Returns a summary of debts and credits for all clients
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    // Get all clients with their pending payments and credit balance
    const clients = await prisma.client.findMany({
      where: { therapistId: session.user.id },
      orderBy: { lastName: "asc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        creditBalance: true,
        payments: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            amount: true,
            createdAt: true,
            session: {
              select: {
                id: true,
                startTime: true,
              },
            },
          },
        },
      },
    });

    // Calculate debt for each client
    const clientDebts = clients.map((client) => {
      const totalDebt = client.payments.reduce(
        (sum, payment) => sum + Number(payment.amount),
        0
      );
      const creditBalance = Number(client.creditBalance);

      return {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        fullName: `${client.firstName} ${client.lastName}`,
        totalDebt,
        creditBalance,
        unpaidSessionsCount: client.payments.length,
        unpaidSessions: client.payments.map((payment) => ({
          paymentId: payment.id,
          amount: Number(payment.amount),
          date: payment.session?.startTime || payment.createdAt,
          sessionId: payment.session?.id,
        })),
      };
    });

    return NextResponse.json(clientDebts);
  } catch (error) {
    console.error("Get client debts error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת נתוני חובות" },
      { status: 500 }
    );
  }
}
