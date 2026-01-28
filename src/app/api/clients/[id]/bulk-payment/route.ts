import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: clientId } = await params;
    const body = await request.json();
    const { amount, method } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid payment amount" },
        { status: 400 }
      );
    }

    if (!["CASH", "CREDIT_CARD", "BANK_TRANSFER", "CHECK"].includes(method)) {
      return NextResponse.json(
        { error: "Invalid payment method" },
        { status: 400 }
      );
    }

    // Verify client belongs to therapist
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        therapistId: session.user.id,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Get unpaid/partially paid sessions in order (oldest first)
    const sessions = await prisma.therapySession.findMany({
      where: {
        clientId: clientId,
        status: "COMPLETED",
        type: { not: "BREAK" },
        OR: [
          { payment: null },
          {
            payment: {
              status: "PENDING",
            },
          },
        ],
      },
      include: {
        payment: true,
      },
      orderBy: {
        startTime: "asc",
      },
    });

    if (sessions.length === 0) {
      return NextResponse.json(
        { error: "No sessions to pay" },
        { status: 400 }
      );
    }

    // Process payment distribution
    let remainingAmount = amount;
    let sessionsUpdated = 0;
    const updates: any[] = [];

    for (const session of sessions) {
      if (remainingAmount <= 0) break;

      const sessionPrice = Number(session.price);
      const alreadyPaid = session.payment ? Number(session.payment.amount) : 0;
      const remainingDebt = sessionPrice - alreadyPaid;

      if (remainingDebt <= 0) continue; // Already paid

      const amountToApply = Math.min(remainingAmount, remainingDebt);
      const newTotalPaid = alreadyPaid + amountToApply;
      const isPaid = newTotalPaid >= sessionPrice;

      if (session.payment) {
        // Update existing payment
        updates.push(
          prisma.payment.update({
            where: { id: session.payment.id },
            data: {
              amount: newTotalPaid,
              status: isPaid ? "PAID" : "PENDING",
              method: method,
              paidAt: isPaid ? new Date() : session.payment.paidAt,
            },
          })
        );
      } else {
        // Create new payment
        updates.push(
          prisma.payment.create({
            data: {
              clientId: clientId,
              sessionId: session.id,
              amount: amountToApply,
              expectedAmount: sessionPrice,
              status: isPaid ? "PAID" : "PENDING",
              method: method,
              paidAt: isPaid ? new Date() : null,
            },
          })
        );
      }

      remainingAmount -= amountToApply;
      sessionsUpdated++;
    }

    // If there's remaining amount, add it as credit
    if (remainingAmount > 0) {
      updates.push(
        prisma.client.update({
          where: { id: clientId },
          data: {
            creditBalance: {
              increment: remainingAmount,
            },
          },
        })
      );
    }

    // Execute all updates in a transaction
    await prisma.$transaction(updates);

    return NextResponse.json({
      success: true,
      sessionsUpdated,
      remainingCredit: remainingAmount,
      message:
        remainingAmount > 0
          ? `קוזזו ${sessionsUpdated} פגישות. ₪${remainingAmount.toFixed(2)} נוסף לקרדיט`
          : `קוזזו ${sessionsUpdated} פגישות בהצלחה`,
    });
  } catch (error) {
    console.error("Error processing bulk payment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
