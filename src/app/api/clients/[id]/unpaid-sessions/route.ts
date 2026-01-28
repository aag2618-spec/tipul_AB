import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: clientId } = await params;

    // Get client with unpaid/partially paid sessions
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        therapistId: session.user.id,
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
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: client.id,
      name: client.name,
      creditBalance: Number(client.creditBalance),
      sessions: client.therapySessions.map((session) => ({
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
      })),
    });
  } catch (error) {
    console.error("Error fetching unpaid sessions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
