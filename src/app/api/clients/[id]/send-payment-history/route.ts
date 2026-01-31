import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createPaymentHistoryEmail } from "@/lib/email-templates/payment-history";
import { sendEmail } from "@/lib/resend";
import { subMonths, startOfDay, endOfDay } from "date-fns";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { period = "all" } = body; // "all", "month", "3months", "year"

    // Get client
    const client = await prisma.client.findFirst({
      where: {
        id,
        therapistId: session.user.id,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (!client.email) {
      return NextResponse.json(
        { error: "Client does not have an email address" },
        { status: 400 }
      );
    }

    // Calculate date range
    const now = new Date();
    let fromDate: Date;

    switch (period) {
      case "month":
        fromDate = subMonths(now, 1);
        break;
      case "3months":
        fromDate = subMonths(now, 3);
        break;
      case "year":
        fromDate = subMonths(now, 12);
        break;
      case "all":
      default:
        fromDate = new Date(0); // Beginning of time
        break;
    }

    // Get payments in range
    const payments = await prisma.payment.findMany({
      where: {
        session: {
          clientId: id,
        },
        paidAt: {
          gte: startOfDay(fromDate),
          lte: endOfDay(now),
        },
      },
      include: {
        session: {
          select: {
            startTime: true,
            type: true,
          },
        },
      },
      orderBy: {
        paidAt: "desc",
      },
    });

    if (payments.length === 0) {
      return NextResponse.json(
        { error: "No payments found in this period" },
        { status: 400 }
      );
    }

    // Calculate total
    const totalPaid = payments.reduce((sum, p) => {
      const amount = typeof p.amount === 'number' ? p.amount : Number(p.amount);
      return sum + amount;
    }, 0);

    // Get therapist communication settings
    const communicationSettings = await prisma.communicationSetting.findUnique(
      {
        where: { userId: session.user.id },
      }
    );

    // Create email
    const emailContent = createPaymentHistoryEmail({
      clientName: client.name,
      therapistName: session.user.name || "המטפל/ת",
      payments: payments.map((p) => ({
        id: p.id,
        amount: typeof p.amount === 'number' ? p.amount : Number(p.amount),
        expectedAmount: typeof p.expectedAmount === 'number' ? p.expectedAmount : Number(p.expectedAmount),
        method: p.method,
        paidAt: p.paidAt || p.createdAt || new Date(),
        session: p.session
          ? {
              startTime: p.session.startTime,
              type: p.session.type,
            }
          : undefined,
      })),
      dateRange: {
        from: fromDate,
        to: now,
      },
      totalPaid,
      customization: communicationSettings
        ? {
            paymentInstructions: communicationSettings.paymentInstructions,
            paymentLink: communicationSettings.paymentLink,
            emailSignature: communicationSettings.emailSignature,
            customGreeting: communicationSettings.customGreeting,
            customClosing: communicationSettings.customClosing,
            businessHours: communicationSettings.businessHours,
            logoUrl: communicationSettings.logoUrl,
          }
        : undefined,
    });

    // Send email
    await sendEmail({
      to: client.email,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    return NextResponse.json({
      success: true,
      message: "Payment history sent successfully",
      paymentsCount: payments.length,
      totalPaid,
    });
  } catch (error) {
    console.error("Error sending payment history:", error);
    return NextResponse.json(
      { error: "Failed to send payment history" },
      { status: 500 }
    );
  }
}
