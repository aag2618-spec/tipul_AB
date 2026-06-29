import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { calculatePaidAmount } from "@/lib/payment-utils";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { buildClientWhere, isSecretary, secretaryCan } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";

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

    const scopeUser = await loadScopeUserWithMode(userId);

    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewDebts")) {
      return NextResponse.json(
        { message: "אין הרשאה לצפייה בחובות" },
        { status: 403 }
      );
    }

    const scopeWhere = buildClientWhere(scopeUser);

    // Get client with unpaid/partially paid sessions
    const client = await prisma.client.findFirst({
      where: { AND: [{ id: clientId }, scopeWhere] },
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
            payment: {
              include: {
                // ⭐ נדרש ל-calculatePaidAmount — ראה ההערה ב-payment-utils.
                childPayments: {
                  where: { status: "PAID" },
                  select: { id: true, amount: true, status: true },
                },
              },
            },
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

    // ⭐ paidAmount קנוני — מטפל באשראי חלקי שסולק (PENDING+CC עם hasReceipt
    // → amount הוא שולם בפועל, לא placeholder). amount בתשובה הוא הכרך
    // ששולם בפועל; ה-frontend מחשב יתרה כ-expectedAmount - amount.
    const sessions = client.therapySessions.map((session) => {
      const paidAmount = session.payment
        ? calculatePaidAmount(session.payment)
        : 0;
      return {
        id: session.id,
        startTime: session.startTime,
        endTime: session.endTime,
        price: Number(session.price),
        type: session.type,
        status: session.status,
        payment: session.payment
          ? {
              id: session.payment.id,
              amount: paidAmount,
              paidAmount,
              expectedAmount: Number(session.payment.expectedAmount),
              status: session.payment.status,
              method: session.payment.method,
              hasReceipt: session.payment.hasReceipt,
            }
          : null,
      };
    });

    const totalDebt = sessions.reduce((sum, s) => {
      if (!s.payment) return sum + s.price;
      const expected = s.payment.expectedAmount;
      if (expected > 0 && s.payment.paidAmount < expected) {
        return sum + (expected - s.payment.paidAmount);
      }
      return sum;
    }, 0);

    return NextResponse.json({
      id: client.id,
      name: client.name,
      creditBalance: Number(client.creditBalance),
      totalDebt,
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
