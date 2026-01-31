import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { createPaymentReceiptEmail } from "@/lib/email-templates/payment-receipt";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

    const { clientId, paymentIds, totalAmount, method, paymentMode, creditUsed = 0 } = await req.json();

    // Enhanced validation
    if (!clientId || !paymentIds || !totalAmount || !method) {
      return NextResponse.json(
        { message: "חסרים פרמטרים" },
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
        { message: "אין תשלומים לעדכון" },
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
        throw new Error("אין תשלומים ממתינים");
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
        clientEmail: client.email,
      };
    });

    // Send payment receipt email if enabled and payment is complete
    try {
      const commSettings = await prisma.communicationSetting.findUnique({
        where: { userId: session.user.id },
      });

      if (commSettings?.sendPaymentReceipt && result.clientEmail) {
        // Get therapist details
        const therapist = await prisma.user.findUnique({
          where: { id: session.user.id },
        });

        // Get updated client data
        const updatedClient = await prisma.client.findUnique({
          where: { id: clientId },
        });

        // Calculate remaining debt
        const allPayments = await prisma.payment.findMany({
          where: {
            clientId,
            status: "PENDING",
          },
        });

        const remainingDebt = allPayments.reduce(
          (sum, p) => sum + (Number(p.expectedAmount) - Number(p.amount)),
          0
        );

        // Send email for each fully paid payment
        for (const payment of result.updatedPayments.filter(p => p.status === "PAID")) {
          // Get session info if exists
          const paymentWithSession = await prisma.payment.findUnique({
            where: { id: payment.id },
            include: { session: true },
          });

          const { subject, html } = createPaymentReceiptEmail({
            clientName: client.name,
            therapistName: therapist?.name || "המטפל/ת שלך",
            payment: {
              amount: Number(payment.amount),
              expectedAmount: Number(payment.expectedAmount || payment.amount),
              method: payment.method,
              paidAt: payment.paidAt || new Date(),
              session: paymentWithSession?.session || undefined,
            },
            clientBalance: {
              remainingDebt,
              credit: Number(updatedClient?.creditBalance || 0),
            },
            customization: {
              paymentInstructions: commSettings?.paymentInstructions,
              paymentLink: commSettings?.paymentLink,
              emailSignature: commSettings?.emailSignature,
              customGreeting: commSettings?.customGreeting,
              customClosing: commSettings?.customClosing,
              businessHours: commSettings?.businessHours,
            },
          });

          await sendEmail({
            to: result.clientEmail,
            subject,
            html,
            replyTo: therapist?.email || undefined,
          });

          // Log communication
          await prisma.communicationLog.create({
            data: {
              type: "CUSTOM",
              channel: "EMAIL",
              recipient: result.clientEmail.toLowerCase(),
              subject,
              content: html,
              status: "SENT",
              sentAt: new Date(),
            },
          });
        }
      }
    } catch (emailError) {
      console.error("Error sending payment receipt email:", emailError);
    }

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
    const errorMessage = error instanceof Error ? error.message : "שגיאה בעיבוד התשלום";
    
    return NextResponse.json(
      { message: errorMessage },
      { status: 500 }
    );
  }
}
