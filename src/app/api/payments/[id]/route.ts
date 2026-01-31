import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { createPaymentReceiptEmail } from "@/lib/email-templates/payment-receipt";

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
    const { status, method, notes, paidAt, amount, paymentMode, creditUsed } = body;

    const existingPayment = await prisma.payment.findFirst({
      where: { id, client: { therapistId: session.user.id } },
      include: { 
        client: true,
        session: true,
      }
    });

    if (!existingPayment) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    // Handle credit usage if specified
    if (creditUsed && Number(creditUsed) > 0) {
      const client = existingPayment.client;
      const creditAmount = Number(creditUsed);
      
      if (Number(client.creditBalance) >= creditAmount) {
        // Deduct from credit balance
        await prisma.client.update({
          where: { id: client.id },
          data: {
            creditBalance: {
              decrement: creditAmount
            }
          }
        });
      } else {
        return NextResponse.json(
          { message: "אין מספיק קרדיט" },
          { status: 400 }
        );
      }
    }

    // Determine payment status based on amount
    let finalStatus = status;
    if (amount !== undefined) {
      const newAmount = Number(amount);
      const expectedAmount = Number(existingPayment.expectedAmount);
      finalStatus = newAmount >= expectedAmount ? "PAID" : "PENDING";
    }

    const payment = await prisma.payment.update({
      where: { id },
      data: {
        status: finalStatus || undefined,
        method: method || undefined,
        amount: amount !== undefined ? Number(amount) : undefined,
        paymentType: paymentMode || undefined,
        notes: notes !== undefined ? notes : undefined,
        paidAt: finalStatus === "PAID" ? paidAt || new Date() : undefined,
      },
    });

    // Complete related task if paid
    if (finalStatus === "PAID") {
      await prisma.task.updateMany({
        where: {
          userId: session.user.id,
          relatedEntityId: id,
          type: "COLLECT_PAYMENT",
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        data: { status: "COMPLETED" },
      });

      // Send payment receipt email if enabled
      try {
        const commSettings = await prisma.communicationSetting.findUnique({
          where: { userId: session.user.id },
        });

        if (commSettings?.sendPaymentReceipt && existingPayment.client.email) {
          // Get therapist details
          const therapist = await prisma.user.findUnique({
            where: { id: session.user.id },
          });

          // Calculate remaining debt and credit
          const allPayments = await prisma.payment.findMany({
            where: {
              clientId: existingPayment.client.id,
              status: "PENDING",
            },
          });

          const remainingDebt = allPayments.reduce(
            (sum, p) => sum + (Number(p.expectedAmount) - Number(p.amount)),
            0
          );

          const { subject, html } = createPaymentReceiptEmail({
            clientName: existingPayment.client.name,
            therapistName: therapist?.name || "המטפל/ת שלך",
            payment: {
              amount: Number(payment.amount),
              expectedAmount: Number(payment.expectedAmount || payment.amount),
              method: payment.method,
              paidAt: payment.paidAt || new Date(),
              session: existingPayment.session || undefined,
            },
            clientBalance: {
              remainingDebt,
              credit: Number(existingPayment.client.creditBalance),
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
            to: existingPayment.client.email,
            subject,
            html,
            replyTo: therapist?.email || undefined,
          });

          // Log communication
          await prisma.communicationLog.create({
            data: {
              type: "CUSTOM",
              channel: "EMAIL",
              recipient: existingPayment.client.email.toLowerCase(),
              subject,
              content: html,
              status: "SENT",
              sentAt: new Date(),
            },
          });
        }
      } catch (emailError) {
        // Don't fail the payment update if email fails
        console.error("Error sending payment receipt email:", emailError);
      }
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Update payment error:", error);
    return NextResponse.json(
      { message: "שגיאה בעדכון התשלום" },
      { status: 500 }
    );
  }
}













