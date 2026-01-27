import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { clientId, paymentIds, totalAmount, method, paymentMode } = await req.json();

    if (!clientId || !paymentIds || !totalAmount || !method) {
      return NextResponse.json(
        { message: "חסרים פרמטרים נדרשים" },
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
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // Get all pending payments for this client
    const pendingPayments = await prisma.payment.findMany({
      where: {
        id: { in: paymentIds },
        clientId,
        status: "PENDING",
      },
      orderBy: {
        createdAt: "asc", // Pay oldest first
      },
    });

    if (pendingPayments.length === 0) {
      return NextResponse.json(
        { message: "לא נמצאו תשלומים ממתינים" },
        { status: 404 }
      );
    }

    let remainingAmount = totalAmount;
    const updatedPayments = [];

    // Distribute payment across all pending payments
    for (const payment of pendingPayments) {
      if (remainingAmount <= 0) break;

      const paymentDebt = Number(payment.expectedAmount) - Number(payment.amount);
      const amountToPayForThis = Math.min(remainingAmount, paymentDebt);

      const newPaidAmount = Number(payment.amount) + amountToPayForThis;
      const isFullyPaid = newPaidAmount >= Number(payment.expectedAmount);

      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          amount: newPaidAmount,
          status: isFullyPaid ? "PAID" : "PENDING",
          method: isFullyPaid ? method : payment.method,
          paidAt: isFullyPaid ? new Date() : payment.paidAt,
        },
      });

      updatedPayments.push(updatedPayment);
      remainingAmount -= amountToPayForThis;
    }

    // If payment mode is FULL and there's remaining amount, something went wrong
    if (paymentMode === "FULL" && remainingAmount > 0.01) {
      console.warn(`Warning: Full payment had remaining amount: ${remainingAmount}`);
    }

    // If payment was made with CREDIT, deduct from client's credit balance
    const totalPaid = totalAmount - remainingAmount;
    if (method === "CREDIT" && totalPaid > 0) {
      const currentCredit = Number(client.creditBalance);
      const newCreditBalance = Math.max(0, currentCredit - totalPaid);
      
      await prisma.client.update({
        where: { id: clientId },
        data: {
          creditBalance: newCreditBalance,
        },
      });

      console.log(`Credit updated: ${currentCredit} -> ${newCreditBalance} (paid: ${totalPaid})`);
    }

    return NextResponse.json({
      success: true,
      message: paymentMode === "PARTIAL" 
        ? `תשלום חלקי של ₪${totalAmount} בוצע בהצלחה`
        : "כל החובות שולמו בהצלחה",
      updatedPayments: updatedPayments.length,
      totalPaid,
    });
  } catch (error) {
    console.error("Pay client debts error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעיבוד התשלום" },
      { status: 500 }
    );
  }
}
