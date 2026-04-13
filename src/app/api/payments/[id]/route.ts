import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { addPartialPayment, markFullyPaid } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { serializePrisma } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    const payment = await prisma.payment.findFirst({
      where: { id, client: { therapistId: userId } },
      include: {
        client: true,
        session: true,
      },
    });

    if (!payment) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(serializePrisma(payment));
  } catch (error) {
    logger.error("Get payment error:", { error: error instanceof Error ? error.message : String(error) });
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
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;
    const body = await request.json();
    const { status, method, notes, amount, creditUsed, issueReceipt } = body;

    // Adding a payment amount (partial or completing)
    if (amount !== undefined) {
      const result = await addPartialPayment({
        userId: userId,
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

      return NextResponse.json(serializePrisma({
        ...result.payment,
        receiptError: result.receiptError,
      }));
    }

    // Marking as fully paid (no specific amount)
    if (status === "PAID") {
      const result = await markFullyPaid({
        userId: userId,
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

      return NextResponse.json(serializePrisma({
        ...result.payment,
        receiptError: result.receiptError,
      }));
    }

    // Simple field update (status change, notes, method — no payment action)
    const existing = await prisma.payment.findFirst({
      where: { id, client: { therapistId: userId } },
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

    return NextResponse.json(serializePrisma(payment));
  } catch (error) {
    logger.error("Update payment error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בעדכון התשלום" },
      { status: 500 }
    );
  }
}

