import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { createPaymentReceiptEmail } from "@/lib/email-templates/payment-receipt";
import { createBillingService } from "@/lib/billing";
import { getReceiptPageUrl } from "@/lib/receipt-token";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

    const payments = await prisma.payment.findMany({
      where: { client: { therapistId: session.user.id } },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        session: { select: { id: true, startTime: true } },
      },
    });

    return NextResponse.json(payments);
  } catch (error) {
    console.error("Get payments error:", error);
    return NextResponse.json(
      { message: "שגיאה בטעינת התשלומים" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

    const body = await request.json();
    const { 
      clientId, 
      sessionId, 
      amount, 
      expectedAmount,
      paymentType = 'FULL',
      method,
      status,
      notes,
      creditUsed,
      issueReceipt
    } = body;

    if (!clientId || !amount) {
      return NextResponse.json(
        { message: "נא למלא את כל השדות הנדרשים" },
        { status: 400 }
      );
    }

    // Verify client ownership
    const client = await prisma.client.findFirst({
      where: { id: clientId, therapistId: session.user.id },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // Handle credit usage if specified
    if (creditUsed && Number(creditUsed) > 0) {
      const creditAmount = Number(creditUsed);
      
      if (Number(client.creditBalance) >= creditAmount) {
        // Deduct from credit balance
        await prisma.client.update({
          where: { id: clientId },
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

    // Create payment
    const payment = await prisma.payment.create({
      data: {
        clientId,
        sessionId: sessionId || null,
        amount,
        expectedAmount: expectedAmount || amount,
        paymentType,
        method: method || "CASH",
        status: status || "PENDING",
        paidAt: status === "PAID" ? new Date() : null,
        notes: notes || null,
      },
      include: {
        client: true,
        session: true,
      },
    });

    // Handle credit balance for ADVANCE payments
    if (paymentType === 'ADVANCE') {
      await prisma.client.update({
        where: { id: clientId },
        data: {
          creditBalance: {
            increment: amount
          }
        }
      });
    }

    // Create task for payment collection (only for partial or unpaid)
    if (paymentType === 'PARTIAL') {
      const remaining = (expectedAmount || amount) - amount;
      await prisma.task.create({
        data: {
          userId: session.user.id,
          type: "COLLECT_PAYMENT",
          title: `גבה יתרת תשלום מ-${client.name} - ₪${remaining}`,
          status: "PENDING",
          priority: "MEDIUM",
          relatedEntityId: payment.id,
          relatedEntity: "Payment",
        },
      });
    }

    // Send payment receipt email and create formal receipt if status is PAID
    if (status === "PAID") {
      try {
        const commSettings = await prisma.communicationSetting.findUnique({
          where: { userId: session.user.id },
        });

        const therapist = await prisma.user.findUnique({
          where: { id: session.user.id },
        });

        let receiptUrl: string | null = null;
        let receiptNumber: string | null = null;

        if (issueReceipt !== false && therapist?.businessType !== "NONE") {
          if (therapist?.businessType === "EXEMPT") {
            const currentNumber = therapist.nextReceiptNumber || 1;
            const year = new Date().getFullYear();
            receiptNumber = `${year}-${String(currentNumber).padStart(4, "0")}`;
            receiptUrl = getReceiptPageUrl(payment.id);

            await prisma.user.update({
              where: { id: session.user.id },
              data: { nextReceiptNumber: currentNumber + 1 },
            });

            await prisma.payment.update({
              where: { id: payment.id },
              data: { receiptNumber, receiptUrl, hasReceipt: true },
            });
          } else {
            // עוסק מורשה: יצירת קבלה דרך ספק חיוב
            try {
              const billingService = createBillingService(session.user.id);
              const receiptResult = await billingService.createReceipt({
                clientName: payment.client.name,
                clientEmail: payment.client.email || undefined,
                clientPhone: payment.client.phone || undefined,
                amount: Number(payment.amount),
                description: payment.session 
                  ? `תשלום עבור פגישה בתאריך ${new Date(payment.session.startTime).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}`
                  : `תשלום עבור טיפול`,
                paymentMethod: mapPaymentMethod(method),
                sendEmail: commSettings?.sendReceiptToClient ?? true,
              });

              if (receiptResult.success) {
                receiptUrl = receiptResult.receiptUrl || null;
                receiptNumber = receiptResult.receiptNumber || null;

                await prisma.payment.update({
                  where: { id: payment.id },
                  data: { receiptUrl, receiptNumber, hasReceipt: true },
                });
              }
            } catch (billingError) {
              console.error("Error creating receipt via billing provider:", billingError);
            }
          }
        }

        // שליחת מייל אישור תשלום
        if (commSettings?.sendPaymentReceipt) {
          const allPayments = await prisma.payment.findMany({
            where: {
              clientId: payment.client.id,
              status: "PENDING",
            },
          });

          const remainingDebt = allPayments.reduce(
            (sum, p) => sum + (Number(p.expectedAmount) - Number(p.amount)),
            0
          );

          const { subject, html } = createPaymentReceiptEmail({
            clientName: payment.client.name,
            therapistName: therapist?.name || "המטפל/ת שלך",
            therapistPhone: therapist?.businessPhone || therapist?.phone || undefined,
            payment: {
              amount: Number(payment.amount),
              expectedAmount: Number(payment.expectedAmount || payment.amount),
              method: payment.method,
              paidAt: payment.paidAt || new Date(),
              session: payment.session || undefined,
              receiptUrl: receiptUrl || undefined,
              receiptNumber: receiptNumber || undefined,
            },
            clientBalance: {
              remainingDebt,
              credit: Number(payment.client.creditBalance),
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

          // שליחה למטופל
          if (commSettings.sendReceiptToClient && payment.client.email) {
            await sendEmail({
              to: payment.client.email,
              subject,
              html,
              replyTo: therapist?.email || undefined,
            });

            await prisma.communicationLog.create({
              data: {
                type: "CUSTOM",
                channel: "EMAIL",
                recipient: payment.client.email.toLowerCase(),
                subject,
                content: html,
                status: "SENT",
                sentAt: new Date(),
                clientId: clientId,
                userId: session.user.id,
              },
            });
          }

          // שליחת עותק למטפל
          if (commSettings.sendReceiptToTherapist && therapist?.email) {
            await sendEmail({
              to: therapist.email,
              subject: `[עותק] ${subject}`,
              html,
            });
          }
        }
      } catch (emailError) {
        console.error("Error sending payment receipt email:", emailError);
      }
    }

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("Create payment error:", error);
    return NextResponse.json(
      { message: "שגיאה ביצירת התשלום" },
      { status: 500 }
    );
  }
}

/**
 * המרת שיטת תשלום לפורמט ספקי החיוב
 */
function mapPaymentMethod(method: string): 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'other' {
  const mapping: Record<string, 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'other'> = {
    CASH: 'cash',
    CHECK: 'check',
    BANK_TRANSFER: 'bank_transfer',
    CREDIT_CARD: 'credit_card',
    CREDIT: 'other',
    OTHER: 'other',
  };
  return mapping[method] || 'other';
}













