import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { createPaymentReceiptEmail } from "@/lib/email-templates/payment-receipt";
import { createBillingService } from "@/lib/billing";
import { getReceiptPageUrl } from "@/lib/receipt-token";
import { mapPaymentMethod } from "@/lib/email-utils";

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
    const { status, method, notes, paidAt, amount, paymentMode, creditUsed, issueReceipt } = body;

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

    // Handle receipt creation if requested
    let receiptNumber: string | undefined;
    let receiptUrl: string | undefined;
    let hasReceipt = false;
    let receiptError: string | undefined;
    
    if (issueReceipt) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { nextReceiptNumber: true, businessType: true },
      });
      
      if (user && user.businessType !== "NONE") {
        if (user.businessType === "EXEMPT") {
          const currentNumber = user.nextReceiptNumber || 1;
          const year = new Date().getFullYear();
          receiptNumber = `${year}-${String(currentNumber).padStart(4, "0")}`;
          receiptUrl = getReceiptPageUrl(id);
          hasReceipt = true;
          
          await prisma.user.update({
            where: { id: session.user.id },
            data: { nextReceiptNumber: currentNumber + 1 },
          });
        } else {
          // עוסק מורשה: יצירת קבלה דרך ספק חיוב
          try {
            const commSettings = await prisma.communicationSetting.findUnique({
              where: { userId: session.user.id },
            });
            const billingService = createBillingService(session.user.id);
            const receiptAmount = amount !== undefined ? Number(amount) : Number(existingPayment.amount);
            const sessionDateStr = existingPayment.session
              ? new Date(existingPayment.session.startTime).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })
              : null;
            let receiptDesc = sessionDateStr
              ? `תשלום עבור פגישה בתאריך ${sessionDateStr}`
              : `תשלום עבור טיפול`;
            const isPartialReceipt = amount !== undefined && (Number(existingPayment.amount) + Number(amount)) < Number(existingPayment.expectedAmount);
            if (isPartialReceipt) {
              receiptDesc += ` (תשלום חלקי - ₪${receiptAmount} מתוך ₪${Number(existingPayment.expectedAmount)})`;
            }
            const receiptResult = await billingService.createReceipt({
              clientName: existingPayment.client.name,
              clientEmail: existingPayment.client.email || undefined,
              clientPhone: existingPayment.client.phone || undefined,
              amount: receiptAmount,
              description: receiptDesc,
              paymentMethod: mapPaymentMethod(method || existingPayment.method),
              sendEmail: commSettings?.sendReceiptToClient ?? true,
            });

            if (receiptResult.success) {
              receiptUrl = receiptResult.receiptUrl || undefined;
              receiptNumber = receiptResult.receiptNumber || undefined;
              hasReceipt = true;
            } else {
              console.error("Billing provider receipt creation failed:", receiptResult.error);
              receiptError = receiptResult.error || "שגיאה ביצירת קבלה בספק החיוב";
            }
          } catch (billingError) {
            console.error("Error creating receipt via billing provider:", billingError);
            receiptError = billingError instanceof Error ? billingError.message : "שגיאה ביצירת קבלה";
          }
        }
      }
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

    let finalStatus = status;
    let finalAmount = Number(existingPayment.amount);
    const expectedAmount = Number(existingPayment.expectedAmount) || 0;
    const existingAmount = Number(existingPayment.amount);
    
    if (amount !== undefined) {
      const newPaymentAmount = Number(amount);
      
      // Only create child payment if this is a partial payment or adding to existing partial
      if (paymentMode === "PARTIAL" || (existingAmount > 0 && newPaymentAmount < (expectedAmount - existingAmount + 1))) {
        await prisma.payment.create({
          data: {
            parentPaymentId: id,
            clientId: existingPayment.clientId,
            amount: newPaymentAmount,
            expectedAmount: newPaymentAmount,
            method: method || existingPayment.method,
            status: "PAID",
            paidAt: new Date(),
            paymentType: "PARTIAL",
          },
        });
      } else if (existingAmount > 0) {
        // Completing a previously partial payment - record the final installment
        await prisma.payment.create({
          data: {
            parentPaymentId: id,
            clientId: existingPayment.clientId,
            amount: newPaymentAmount,
            expectedAmount: newPaymentAmount,
            method: method || existingPayment.method,
            status: "PAID",
            paidAt: new Date(),
            paymentType: "FULL",
          },
        });
      }
      
      finalAmount = existingAmount + newPaymentAmount;
      finalStatus = finalAmount >= expectedAmount ? "PAID" : "PENDING";
    }

    const now = new Date();
    const payment = await prisma.payment.update({
      where: { id },
      data: {
        status: finalStatus || undefined,
        method: method || undefined,
        amount: finalAmount,
        paymentType: finalAmount >= expectedAmount ? "FULL" : (paymentMode || undefined),
        notes: notes !== undefined ? notes : undefined,
        paidAt: finalStatus === "PAID" ? (paidAt || now) : (paymentMode === "PARTIAL" ? now : undefined),
        receiptNumber: receiptNumber || undefined,
        receiptUrl: receiptUrl || undefined,
        hasReceipt: hasReceipt || undefined,
      },
    });

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
    }

    // שליחת מייל קבלה - גם על תשלום חלקי
    const paidNow = amount !== undefined ? Number(amount) : (finalStatus === "PAID" ? Number(payment.amount) : 0);
    if (paidNow > 0) {
      try {
        const commSettings = await prisma.communicationSetting.findUnique({
          where: { userId: session.user.id },
        });

        if (commSettings?.sendPaymentReceipt) {
          const therapist = await prisma.user.findUnique({
            where: { id: session.user.id },
          });

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
            therapistPhone: therapist?.businessPhone || therapist?.phone || undefined,
            payment: {
              amount: paidNow,
              expectedAmount: Number(payment.expectedAmount || payment.amount),
              method: payment.method,
              paidAt: payment.paidAt || new Date(),
              session: existingPayment.session || undefined,
              receiptUrl: receiptUrl || undefined,
              receiptNumber: receiptNumber || undefined,
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

          if (commSettings.sendReceiptToClient && existingPayment.client.email) {
            const emailResult = await sendEmail({
              to: existingPayment.client.email,
              subject,
              html,
            });

            await prisma.communicationLog.create({
              data: {
                type: "CUSTOM",
                channel: "EMAIL",
                recipient: existingPayment.client.email.toLowerCase(),
                subject,
                content: html,
                status: "SENT",
                sentAt: new Date(),
                messageId: emailResult.messageId || null,
                clientId: existingPayment.clientId,
                userId: session.user.id,
              },
            });
          }

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

    return NextResponse.json({ ...payment, receiptError });
  } catch (error) {
    console.error("Update payment error:", error);
    return NextResponse.json(
      { message: "שגיאה בעדכון התשלום" },
      { status: 500 }
    );
  }
}










