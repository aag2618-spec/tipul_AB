import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createPaymentForSession } from "@/lib/payment-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { amount, notes } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ message: "סכום לא תקין" }, { status: 400 });
    }

    const result = await createPaymentForSession({
      userId: session.user.id,
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
      newBalance: updatedClient?.creditBalance,
    });
  } catch (error) {
    console.error("Add credit error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בהוספת קרדיט" },
      { status: 500 }
    );
  }
}
