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
            method: method,
            paymentType: isFullyPaid ? "FULL" : "PARTIAL",
            paidAt: isFullyPaid ? new Date() : undefined,
          },
        });

        updatedPayments.push({ ...updatedPayment, _amountPaidNow: amountToPayForThis });
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

    // הנפקת קבלות ושליחת מיילים
    try {
      const commSettings = await prisma.communicationSetting.findUnique({
        where: { userId: session.user.id },
      });

      const therapist = await prisma.user.findUnique({
        where: { id: session.user.id },
      });

      const updatedClient = await prisma.client.findUnique({
        where: { id: clientId },
      });

      let localReceiptCounter = therapist?.nextReceiptNumber || 1;

      // הנפקת קבלות לכל תשלום שהתקבל (כולל חלקי)
      for (const payment of result.updatedPayments) {
        const amountPaidNow = (payment as { _amountPaidNow?: number })._amountPaidNow || 0;
        if (amountPaidNow <= 0) continue;
        const isPartial = Number(payment.amount) < Number(payment.expectedAmount);
        let receiptNumber: string | null = null;
        let receiptUrl: string | null = null;

        if (therapist?.businessType && therapist.businessType !== "NONE") {
          if (therapist.businessType === "EXEMPT") {
            const year = new Date().getFullYear();
            receiptNumber = `${year}-${String(localReceiptCounter).padStart(4, "0")}`;
            receiptUrl = getReceiptPageUrl(payment.id);
            localReceiptCounter++;

            await prisma.user.update({
              where: { id: session.user.id },
              data: { nextReceiptNumber: localReceiptCounter },
            });

            await prisma.payment.update({
              where: { id: payment.id },
              data: { receiptNumber, receiptUrl, hasReceipt: true },
            });
          } else {
            // עוסק מורשה: יצירת קבלה דרך ספק חיוב
            try {
              const paymentWithSession = await prisma.payment.findUnique({
                where: { id: payment.id },
                include: { session: true },
              });

              const billingService = createBillingService(session.user.id);
              const sessionDateStr = paymentWithSession?.session
                ? new Date(paymentWithSession.session.startTime).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })
                : null;
              let description = sessionDateStr
                ? `תשלום עבור פגישה בתאריך ${sessionDateStr}`
                : `תשלום עבור טיפול`;
              if (isPartial) {
                description += ` (תשלום חלקי - ₪${amountPaidNow} מתוך ₪${Number(payment.expectedAmount)})`;
              }
              const receiptResult = await billingService.createReceipt({
                clientName: client.name,
                clientEmail: client.email || undefined,
                clientPhone: client.phone || undefined,
                amount: amountPaidNow,
                description,
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

        // שליחת מייל קבלה
        if (commSettings?.sendPaymentReceipt) {
          const allPendingPayments = await prisma.payment.findMany({
            where: { clientId, status: "PENDING" },
          });

          const remainingDebt = allPendingPayments.reduce(
            (sum, p) => sum + (Number(p.expectedAmount) - Number(p.amount)),
            0
          );

          const paymentWithSession = await prisma.payment.findUnique({
            where: { id: payment.id },
            include: { session: true },
          });

          const { subject, html } = createPaymentReceiptEmail({
            clientName: client.name,
            therapistName: therapist?.name || "המטפל/ת שלך",
            therapistPhone: therapist?.businessPhone || therapist?.phone || undefined,
            payment: {
              amount: amountPaidNow,
              expectedAmount: Number(payment.expectedAmount || payment.amount),
              method: payment.method,
              paidAt: payment.paidAt || new Date(),
              session: paymentWithSession?.session || undefined,
              receiptUrl: receiptUrl || undefined,
              receiptNumber: receiptNumber || undefined,
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

          // שליחה למטופל
          if (commSettings.sendReceiptToClient && result.clientEmail) {
            await sendEmail({
              to: result.clientEmail,
              subject,
              html,
            });

            await prisma.communicationLog.create({
              data: {
                type: "CUSTOM",
                channel: "EMAIL",
                recipient: result.clientEmail.toLowerCase(),
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

