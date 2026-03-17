import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyReceiptToken } from "@/lib/receipt-token";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.nextUrl.searchParams.get("t");

    if (!token || token.length !== 24) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    try {
      if (!verifyReceiptToken(id, token)) {
        return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        client: { select: { name: true } },
        session: { select: { startTime: true, type: true } },
        parentPayment: {
          select: {
            expectedAmount: true,
            amount: true,
            session: { select: { startTime: true } },
            childPayments: {
              select: { id: true, amount: true, paidAt: true, createdAt: true },
              orderBy: { paidAt: "asc" as const },
            },
          },
        },
        childPayments: { select: { amount: true } },
      },
    });

    if (!payment) {
      return NextResponse.json({ message: "קבלה לא נמצאה" }, { status: 404 });
    }

    const therapist = await prisma.user.findFirst({
      where: { clients: { some: { id: payment.clientId } } },
      select: {
        name: true,
        businessName: true,
        businessPhone: true,
        businessAddress: true,
      },
    });

    let amount = Number(payment.amount);

    // Legacy fix: receipt on parent whose amount grew with subsequent partials
    if (
      !payment.parentPaymentId &&
      payment.childPayments &&
      payment.childPayments.length > 0
    ) {
      const childSum = payment.childPayments.reduce(
        (s, c) => s + Number(c.amount),
        0
      );
      const originalAmount = Number(payment.amount) - childSum;
      if (originalAmount > 0) amount = originalAmount;
    }

    const sessionExpectedAmount = payment.parentPaymentId
      ? Number(payment.parentPayment?.expectedAmount || payment.expectedAmount || amount)
      : Number(payment.expectedAmount || amount);

    let remaining = 0;
    if (payment.parentPaymentId && payment.parentPayment) {
      const siblings = payment.parentPayment.childPayments || [];
      let cumulativePaid = 0;
      for (const sib of siblings) {
        cumulativePaid += Number(sib.amount);
        if (sib.id === payment.id) break;
      }
      remaining = Math.max(0, sessionExpectedAmount - cumulativePaid);
    } else {
      remaining = Math.max(0, sessionExpectedAmount - amount);
    }

    const isPartial = remaining > 0;

    const sessionDate = payment.session?.startTime 
      || payment.parentPayment?.session?.startTime 
      || null;

    return NextResponse.json({
      receiptNumber: payment.receiptNumber,
      amount,
      expectedAmount: sessionExpectedAmount,
      method: payment.method,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      clientName: payment.client.name,
      sessionDate,
      receiptUrl: payment.receiptUrl,
      isPartial,
      remaining,
      therapist: {
        name: therapist?.name || "",
        businessName: therapist?.businessName || "",
        phone: therapist?.businessPhone || "",
        address: therapist?.businessAddress || "",
      },
    });
  } catch (error) {
    logger.error("Public receipt error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ message: "שגיאה בטעינת הקבלה" }, { status: 500 });
  }
}
