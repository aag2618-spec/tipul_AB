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

    // קבלת כל התשלומים ששולמו במלואם
    const payments = await prisma.payment.findMany({
      where: {
        client: { therapistId: session.user.id },
        status: "PAID",
        parentPaymentId: null,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        },
        session: {
          select: {
            id: true,
            startTime: true,
            type: true,
          },
        },
        childPayments: {
          select: {
            id: true,
            amount: true,
            method: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        paidAt: "desc",
      },
    });

    const fullyPaidPayments = payments.filter((payment) => {
      const amount = Number(payment.amount);
      const expectedAmount = payment.expectedAmount ? Number(payment.expectedAmount) : amount;
      return amount >= expectedAmount;
    });

    // המרה לפורמט הנדרש - כולל כל הנתונים ל-PaymentHistoryItem
    const result = fullyPaidPayments.map((payment) => ({
      id: payment.id,
      clientId: payment.client.id,
      clientName: payment.client.firstName && payment.client.lastName
        ? `${payment.client.firstName} ${payment.client.lastName}`
        : payment.client.name,
      amount: Number(payment.amount),
      expectedAmount: payment.expectedAmount ? Number(payment.expectedAmount) : Number(payment.amount),
      method: payment.method,
      status: payment.status,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      receiptNumber: payment.receiptNumber,
      receiptUrl: payment.receiptUrl,
      hasReceipt: payment.hasReceipt,
      session: payment.session ? {
        id: payment.session.id,
        startTime: payment.session.startTime,
        type: payment.session.type,
      } : null,
      childPayments: payment.childPayments?.map((child) => ({
        id: child.id,
        amount: Number(child.amount),
        method: child.method || payment.method,
        paidAt: child.paidAt,
        createdAt: child.createdAt,
      })) || [],
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get paid history error:", error);
    return NextResponse.json(
      { message: "שגיאה בטעינת היסטוריית התשלומים" },
      { status: 500 }
    );
  }
}
