import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * POST /api/payments/bulk-payment
 * Process a bulk payment that automatically distributes across multiple sessions
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { clientId, amount, method, notes, useCredit } = body;

    if (!clientId || !amount || amount <= 0) {
      return NextResponse.json(
        { message: "נתונים חסרים או לא תקינים" },
        { status: 400 }
      );
    }

    // Verify client ownership
    const client = await prisma.client.findFirst({
      where: { id: clientId, therapistId: session.user.id },
      include: {
        payments: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
          include: {
            session: {
              select: { startTime: true },
            },
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    if (client.payments.length === 0) {
      return NextResponse.json(
        { message: "אין תשלומים ממתינים למטופל זה" },
        { status: 400 }
      );
    }

    let remainingAmount = parseFloat(amount);
    const updatedPayments = [];
    const paidAt = new Date();

    // Handle credit payment
    if (useCredit && method === "CREDIT") {
      const creditBalance = Number(client.creditBalance);
      
      if (creditBalance <= 0) {
        return NextResponse.json(
          { message: "אין קרדיט זמין" },
          { status: 400 }
        );
      }

      // Use credit (limited to available balance)
      const creditToUse = Math.min(creditBalance, remainingAmount);
      remainingAmount = creditToUse;

      // Update client credit balance
      await prisma.client.update({
        where: { id: clientId },
        data: {
          creditBalance: {
            decrement: creditToUse,
          },
        },
      });
    }

    // Sort payments by session date (oldest first)
    const sortedPayments = client.payments.sort((a, b) => {
      const dateA = a.session?.startTime || a.createdAt;
      const dateB = b.session?.startTime || b.createdAt;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

    // Distribute payment across sessions
    for (const payment of sortedPayments) {
      if (remainingAmount <= 0) break;

      const paymentAmount = Number(payment.amount);
      const amountToPay = Math.min(remainingAmount, paymentAmount);

      if (amountToPay >= paymentAmount) {
        // Full payment - mark as PAID
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "PAID",
            method: method || "CASH",
            paidAt,
            notes: notes || null,
          },
        });

        updatedPayments.push({
          paymentId: payment.id,
          originalAmount: paymentAmount,
          paidAmount: amountToPay,
          status: "PAID",
        });
      } else {
        // Partial payment - create a new PAID payment for the partial amount
        // and update the original to reduce the amount
        await prisma.payment.create({
          data: {
            clientId: payment.clientId,
            sessionId: payment.sessionId,
            amount: amountToPay,
            status: "PAID",
            method: method || "CASH",
            paidAt,
            notes: notes ? `${notes} (תשלום חלקי)` : "תשלום חלקי",
          },
        });

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            amount: {
              decrement: amountToPay,
            },
          },
        });

        updatedPayments.push({
          paymentId: payment.id,
          originalAmount: paymentAmount,
          paidAmount: amountToPay,
          status: "PARTIAL",
          remainingAmount: paymentAmount - amountToPay,
        });
      }

      remainingAmount -= amountToPay;
    }

    return NextResponse.json({
      success: true,
      totalPaid: parseFloat(amount) - remainingAmount,
      remainingAmount,
      updatedPayments,
      message: remainingAmount > 0
        ? `שולם ₪${parseFloat(amount) - remainingAmount}. נותרו ₪${remainingAmount.toFixed(2)} ללא פגישות להקצות.`
        : `התשלום בסך ₪${amount} חולק בהצלחה על ${updatedPayments.length} פגישות`,
    });
  } catch (error) {
    console.error("Bulk payment error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעיבוד התשלום" },
      { status: 500 }
    );
  }
}
