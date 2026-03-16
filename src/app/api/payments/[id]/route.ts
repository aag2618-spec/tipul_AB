import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { addPartialPayment, markFullyPaid } from "@/lib/payment-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

    const { id } = await params;

    const payment = await prisma.payment.findFirst({
      where: { id, client: { therapistId: session.user.id } },
      include: {
        client: true,
        session: true,
      },
    });

    if (!payment) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Get payment error:", error);
    return NextResponse.json(
      { message: "שגיאה בטעינת התשלום" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, method, notes, amount, creditUsed, issueReceipt } = body;

    // Adding a payment amount (partial or completing)
    if (amount !== undefined) {
      const result = await addPartialPayment({
        userId: session.user.id,
        parentPaymentId: id,
        amount: Number(amount),
        method: method || "CASH",
        issueReceipt,
        creditUsed: creditUsed ? Number(creditUsed) : undefined,
      });

      if (!result.success) {
        return NextResponse.json({ message: result.error }, { status: 400 });
      }

      if (notes !== undefined) {
        await prisma.payment.update({ where: { id }, data: { notes } });
      }

      return NextResponse.json({
        ...result.payment,
        receiptError: result.receiptError,
      });
    }

    // Marking as fully paid (no specific amount)
    if (status === "PAID") {
      const result = await markFullyPaid({
        userId: session.user.id,
        paymentId: id,
        method: method || "CASH",
        issueReceipt,
        creditUsed: creditUsed ? Number(creditUsed) : undefined,
      });

      if (!result.success) {
        return NextResponse.json({ message: result.error }, { status: 400 });
      }

      if (notes !== undefined) {
        await prisma.payment.update({ where: { id }, data: { notes } });
      }

      return NextResponse.json({
        ...result.payment,
        receiptError: result.receiptError,
      });
    }

    // Simple field update (status change, notes, method — no payment action)
    const existing = await prisma.payment.findFirst({
      where: { id, client: { therapistId: session.user.id } },
    });
    if (!existing) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    const payment = await prisma.payment.update({
      where: { id },
      data: {
        status: status || undefined,
        method: method || undefined,
        notes: notes !== undefined ? notes : undefined,
      },
    });

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Update payment error:", error);
    return NextResponse.json(
      { message: "שגיאה בעדכון התשלום" },
      { status: 500 }
    );
  }
}










