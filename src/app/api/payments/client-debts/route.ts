import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

    // Get all clients with their payment data
    const clients = await prisma.client.findMany({
      where: {
        therapistId: session.user.id,
        status: { not: "ARCHIVED" },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        name: true,
        creditBalance: true,
        payments: {
          where: {
            status: "PENDING",
          },
          select: {
            id: true,
            amount: true,
            expectedAmount: true,
            createdAt: true,
            sessionId: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    // Calculate debts for each client
    const clientDebts = clients.map((client) => {
      const unpaidSessions = client.payments.map((payment) => ({
        paymentId: payment.id,
        amount: Number(payment.expectedAmount) - Number(payment.amount),
        date: payment.createdAt,
        sessionId: payment.sessionId,
      }));

      const totalDebt = unpaidSessions.reduce((sum, session) => sum + session.amount, 0);

      console.log(`Client ${client.firstName} ${client.lastName}: ${client.payments.length} payments, totalDebt: ${totalDebt}`);

      return {
        id: client.id,
        firstName: client.firstName || "",
        lastName: client.lastName || "",
        fullName: client.firstName && client.lastName 
          ? `${client.firstName} ${client.lastName}`
          : client.name,
        totalDebt,
        creditBalance: Number(client.creditBalance),
        unpaidSessionsCount: unpaidSessions.length,
        unpaidSessions,
      };
    });

    console.log(`Total clients with debts/credits: ${clientDebts.filter(c => c.totalDebt > 0 || c.creditBalance > 0).length}`);

    // Filter out clients with no debt and no credit
    const relevantClients = clientDebts.filter(
      (client) => client.totalDebt > 0 || client.creditBalance > 0
    );

    return NextResponse.json(relevantClients);
  } catch (error) {
    console.error("Get client debts error:", error);
    return NextResponse.json(
      { message: "שגיאה בטעינת החובות" },
      { status: 500 }
    );
  }
}
