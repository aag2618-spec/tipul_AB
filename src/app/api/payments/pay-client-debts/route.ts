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

    const { clientId, paymentIds, totalAmount, method, paymentMode, creditUsed = 0 } = await req.json();

    // Enhanced validation
    if (!clientId || !paymentIds || !totalAmount || !method) {
      return NextResponse.json(
        { message: "חסרים פרמטרים נדרשים" },
        { status: 400 }
      );
    }

    // Validate amount is positive
    if (totalAmount <= 0) {
      return NextResponse.json(
        { message: "סכום התשלום חייב להיות חיובי" },
        { status: 400 }
      );
    }

    // Validate paymentIds is an array
    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      return NextResponse.json(
        { message: "לא נמצאו תשלומים לעדכון" },
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

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Get all pending payments for this client
      const pendingPayments = await tx.payment.findMany({
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
        throw new Error("לא נמצאו תשלומים ממתינים");
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

        const updatedPayment = await tx.payment.update({
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
      if (paymentMode === "FULL" && remainingAmount > 0.001) {
        console.warn(`Warning: Full payment had remaining amount: ${remainingAmount}`);
      }

      // If credit was used, deduct from client's credit balance
      const totalPaid = totalAmount - remainingAmount;
      if (creditUsed > 0) {
        const currentCredit = Number(client.creditBalance);
        
        // Validate sufficient credit
        if (currentCredit < creditUsed) {
          throw new Error(`אין מספיק קרדיט. זמין: ₪${currentCredit.toFixed(0)}, מבוקש: ₪${creditUsed.toFixed(0)}`);
        }
        
        const newCreditBalance = currentCredit - creditUsed;
        
        await tx.client.update({
          where: { id: clientId },
          data: {
            creditBalance: newCreditBalance,
          },
        });

        console.log(`Credit updated: ${currentCredit} -> ${newCreditBalance} (used: ${creditUsed})`);
      }

      return {
        updatedPayments,
        totalPaid,
      };
    });

    return NextResponse.json({
      success: true,
      message: paymentMode === "PARTIAL" 
        ? `תשלום חלקי של ₪${totalAmount} בוצע בהצלחה`
        : "כל החובות שולמו בהצלחה",
      updatedPayments: result.updatedPayments.length,
      totalPaid: result.totalPaid,
    });
  } catch (error) {
    console.error("Pay client debts error:", error);
    
    // Return more specific error messages
    const errorMessage = error instanceof Error ? error.message : "אירעה שגיאה בעיבוד התשלום";
    
    return NextResponse.json(
      { message: errorMessage },
      { status: 500 }
    );
  }
}
