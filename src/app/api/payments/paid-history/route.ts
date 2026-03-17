import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    // קבלת כל התשלומים ששולמו במלואם
    const payments = await prisma.payment.findMany({
      where: {
        client: { therapistId: userId },
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
            receiptNumber: true,
            receiptUrl: true,
            hasReceipt: true,
          },
          orderBy: { paidAt: "asc" },
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
    const result = fullyPaidPayments.map((payment) => {
      const firstChildWithReceipt = payment.childPayments?.find((c) => c.hasReceipt);
      const receiptNumber = payment.receiptNumber || firstChildWithReceipt?.receiptNumber || null;
      const receiptUrl = payment.receiptUrl || firstChildWithReceipt?.receiptUrl || null;
      const hasReceipt = payment.hasReceipt || !!firstChildWithReceipt?.hasReceipt;

      return {
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
        receiptNumber,
        receiptUrl,
        hasReceipt,
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
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Get paid history error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת היסטוריית התשלומים" },
      { status: 500 }
    );
  }
}
