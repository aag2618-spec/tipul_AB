import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
            parentPaymentId: null,
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

    // Auto-fix: update stuck PENDING payments that are actually fully paid
    const allPendingPayments = clients.flatMap(c => c.payments);
    const stuckPayments = allPendingPayments.filter(p => {
      const paid = Number(p.amount);
      const expected = Number(p.expectedAmount) || 0;
      return (expected > 0 && paid >= expected) || (expected === 0 && paid > 0);
    });
    if (stuckPayments.length > 0) {
      const stuckIds = stuckPayments.map(p => p.id);
      await prisma.payment.updateMany({
        where: { id: { in: stuckIds } },
        data: { status: "PAID", paidAt: new Date() },
      });
      await prisma.task.updateMany({
        where: {
          userId: session.user.id,
          relatedEntityId: { in: stuckIds },
          type: "COLLECT_PAYMENT",
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        data: { status: "COMPLETED" },
      });
    }

    // Calculate debts for each client
    const clientDebts = clients.map((client) => {
      const unpaidSessions = client.payments
        .filter((payment) => {
          const paid = Number(payment.amount);
          const expected = Number(payment.expectedAmount) || 0;
          return expected > 0 && paid < expected;
        })
        .map((payment) => {
          const paidAmount = Number(payment.amount);
          const expectedAmount = Number(payment.expectedAmount) || 0;
          const hasPartialPayment = paidAmount > 0 && paidAmount < expectedAmount;
          return {
            paymentId: payment.id,
            amount: expectedAmount,
            paidAmount,
            date: payment.createdAt,
            sessionId: payment.sessionId,
            partialPaymentDate: hasPartialPayment ? payment.updatedAt : null,
          };
        });

      const totalDebt = unpaidSessions.reduce((sum, s) => sum + (s.amount - s.paidAmount), 0);

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
