import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { createPaymentForSession } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { parseBody } from "@/lib/validations/helpers";
import { createPaymentSchema } from "@/lib/validations/payment";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const payments = await prisma.payment.findMany({
      where: { client: { therapistId: userId } },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        session: { select: { id: true, startTime: true } },
      },
    });

    return NextResponse.json(payments);
  } catch (error) {
    logger.error("Get payments error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת התשלומים" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const parsed = await parseBody(request, createPaymentSchema);
    if ("error" in parsed) return parsed.error;
    const {
      clientId,
      sessionId,
      amount,
      expectedAmount,
      paymentType,
      method,
      status,
      notes,
      creditUsed,
      issueReceipt,
    } = parsed.data;

    const result = await createPaymentForSession({
      userId,
      clientId,
      sessionId,
      amount: Number(amount),
      expectedAmount: Number(expectedAmount || amount),
      method: method || "CASH",
      paymentType: paymentType ?? "FULL",
      status,
      issueReceipt,
      notes,
      creditUsed: creditUsed ? Number(creditUsed) : undefined,
    });

    if (!result.success) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    return NextResponse.json(
      { ...result.payment, receiptError: result.receiptError },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Create payment error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת התשלום" },
      { status: 500 }
    );
  }
}
