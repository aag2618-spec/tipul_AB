import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createPaymentHistoryEmail } from "@/lib/email-templates/payment-history";
import { sendEmail } from "@/lib/resend";
import { subMonths, startOfDay, endOfDay } from "date-fns";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { buildClientWhere, isSecretary, loadScopeUser, secretaryCan } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;
    const body = await req.json();
    const { period = "all" } = body; // "all", "month", "3months", "year"

    const scopeUser = await loadScopeUser(userId);

    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewPayments")) {
      return NextResponse.json(
        { message: "אין הרשאה לצפייה בתשלומים" },
        { status: 403 }
      );
    }

    const scopeWhere = buildClientWhere(scopeUser);

    // Get client
    const client = await prisma.client.findFirst({
      where: { AND: [{ id }, scopeWhere] },
    });

    if (!client) {
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

    if (!client.email) {
      return NextResponse.json(
        { message: "Client does not have an email address" },
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

    const payments = await prisma.payment.findMany({
      where: {
        session: {
          clientId: id,
        },
        parentPaymentId: null,
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
        { message: "No payments found in this period" },
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
        where: { userId: userId },
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
    logger.error("Error sending payment history:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to send payment history" },
      { status: 500 }
    );
  }
}
