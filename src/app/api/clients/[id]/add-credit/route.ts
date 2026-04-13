import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createPaymentForSession } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { serializePrisma } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;
    const body = await request.json();
    const { amount, notes } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ message: "סכום לא תקין" }, { status: 400 });
    }

    const result = await createPaymentForSession({
      userId: userId,
      clientId: id,
      amount: Number(amount),
      expectedAmount: Number(amount),
      method: "CREDIT",
      paymentType: "ADVANCE",
      notes: notes || `הוספת קרדיט: ₪${amount}`,
    });

    if (!result.success) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    const updatedClient = await prisma.client.findUnique({
      where: { id },
      select: { creditBalance: true },
    });

    return NextResponse.json({
      message: "הקרדיט נוסף בהצלחה",
      newBalance: Number(updatedClient?.creditBalance || 0),
    });
  } catch (error) {
    logger.error("Add credit error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בהוספת קרדיט" },
      { status: 500 }
    );
  }
}
