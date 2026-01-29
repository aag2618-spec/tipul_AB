import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

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

    // Verify ownership
    const existingClient = await prisma.client.findFirst({
      where: { id, therapistId: session.user.id },
    });

    if (!existingClient) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // Update credit balance
    const updatedClient = await prisma.client.update({
      where: { id },
      data: {
        creditBalance: {
          increment: amount,
        },
      },
    });

    // Create a payment record for tracking (optional - for history)
    await prisma.payment.create({
      data: {
        clientId: id,
        amount: amount,
        expectedAmount: amount,
        method: "CREDIT",
        status: "PAID",
        notes: notes || `הוספת קרדיט: ₪${amount}`,
        paidAt: new Date(),
      },
    });

    return NextResponse.json({
      message: "הקרדיט נוסף בהצלחה",
      newBalance: updatedClient.creditBalance,
    });
  } catch (error) {
    console.error("Add credit error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בהוספת קרדיט" },
      { status: 500 }
    );
  }
}
