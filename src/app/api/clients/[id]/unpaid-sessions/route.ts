import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { calculateDebtFromSessions } from "@/lib/payment-utils";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id: clientId } = await params;

    // Get client with unpaid/partially paid sessions
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        therapistId: userId,
      },
      select: {
        id: true,
        name: true,
        creditBalance: true,
        therapySessions: {
          where: {
            status: "COMPLETED",
            type: { not: "BREAK" },
            OR: [
              // No payment at all
              { payment: null },
              // Partial payment
              {
                payment: {
                  status: "PENDING",
                },
              },
            ],
          },
          include: {
            payment: true,
          },
          orderBy: {
            startTime: "asc", // Oldest first for auto-deduction
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

    const sessions = client.therapySessions.map((session) => ({
      id: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      price: Number(session.price),
      type: session.type,
      status: session.status,
      payment: session.payment
        ? {
            id: session.payment.id,
            amount: Number(session.payment.amount),
            expectedAmount: Number(session.payment.expectedAmount),
            status: session.payment.status,
            method: session.payment.method,
          }
        : null,
    }));

    return NextResponse.json({
      id: client.id,
      name: client.name,
      creditBalance: Number(client.creditBalance),
      totalDebt: calculateDebtFromSessions(sessions),
      sessions,
    });
  } catch (error) {
    logger.error("Error fetching unpaid sessions:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
