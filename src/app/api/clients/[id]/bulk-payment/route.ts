import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createPaymentForSession, processMultiSessionPayment } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id: clientId } = await params;
    const body = await request.json();
    const { amount, method } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { message: "Invalid payment amount" },
        { status: 400 }
      );
    }

    if (!["CASH", "CREDIT_CARD", "BANK_TRANSFER", "CHECK", "CREDIT", "OTHER"].includes(method)) {
      return NextResponse.json(
        { message: "Invalid payment method" },
        { status: 400 }
      );
    }

    const client = await prisma.client.findFirst({
      where: { id: clientId, therapistId: userId },
    });

    if (!client) {
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

    // Find unpaid/partially-paid completed sessions (oldest first)
    const sessions = await prisma.therapySession.findMany({
      where: {
        clientId,
        status: "COMPLETED",
        type: { not: "BREAK" },
        OR: [
          { payment: null },
          { payment: { status: "PENDING" } },
        ],
      },
      include: { payment: true },
      orderBy: { startTime: "asc" },
    });

    if (sessions.length === 0) {
      return NextResponse.json(
        { message: "No sessions to pay" },
        { status: 400 }
      );
    }

    // Ensure every session has a payment record; collect IDs
    const paymentIds: string[] = [];
    for (const s of sessions) {
      if (s.payment) {
        paymentIds.push(s.payment.id);
      } else {
        const result = await createPaymentForSession({
          userId: userId,
          clientId,
          sessionId: s.id,
          amount: 0,
          expectedAmount: Number(s.price),
          method: "CASH",
          paymentType: "FULL",
        });
        if (result.success && result.payment) {
          paymentIds.push(result.payment.id);
        }
      }
    }

    const result = await processMultiSessionPayment({
      userId: userId,
      clientId,
      paymentIds,
      totalAmount: Number(amount),
      method,
      paymentMode: "FULL",
    });

    if (!result.success) {
      return NextResponse.json({ message: result.error }, { status: 500 });
    }

    // Surplus goes to credit — via trunk for audit trail
    if (result.remainingAmount > 0) {
      await createPaymentForSession({
        userId: userId,
        clientId,
        amount: result.remainingAmount,
        expectedAmount: result.remainingAmount,
        method,
        paymentType: "ADVANCE",
        issueReceipt: false,
        notes: `עודף מתשלום מרוכז — נוסף לקרדיט`,
      });
    }

    return NextResponse.json({
      success: true,
      sessionsUpdated: result.updatedPayments,
      remainingCredit: result.remainingAmount,
      message:
        result.remainingAmount > 0
          ? `קוזזו ${result.updatedPayments} פגישות. ₪${result.remainingAmount.toFixed(2)} נוסף לקרדיט`
          : `קוזזו ${result.updatedPayments} פגישות בהצלחה`,
    });
  } catch (error) {
    logger.error("Error processing bulk payment:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
