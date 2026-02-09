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
            updatedAt: true,
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
      const unpaidSessions = client.payments.map((payment) => {
        const paidAmount = Number(payment.amount);
        // אם יש תשלום חלקי, נשתמש בתאריך העדכון כתאריך התשלום החלקי
        const hasPartialPayment = paidAmount > 0 && paidAmount < Number(payment.expectedAmount);
        return {
          paymentId: payment.id,
          amount: Number(payment.expectedAmount),
          paidAmount,
          date: payment.createdAt,
          sessionId: payment.sessionId,
          partialPaymentDate: hasPartialPayment ? payment.updatedAt : null,
        };
      });

      const totalDebt = unpaidSessions.reduce((sum, session) => sum + (session.amount - session.paidAmount), 0);

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
