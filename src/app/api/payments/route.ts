import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const payments = await prisma.payment.findMany({
      where: { client: { therapistId: session.user.id } },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        session: { select: { id: true, startTime: true } },
      },
    });

    return NextResponse.json(payments);
  } catch (error) {
    console.error("Get payments error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת התשלומים" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { 
      clientId, 
      sessionId, 
      amount, 
      expectedAmount,
      paymentType = 'FULL',
      method, 
      notes 
    } = body;

    if (!clientId || !amount) {
      return NextResponse.json(
        { message: "נא למלא את כל השדות הנדרשים" },
        { status: 400 }
      );
    }

    // Verify client ownership
    const client = await prisma.client.findFirst({
      where: { id: clientId, therapistId: session.user.id },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // Create payment
    const payment = await prisma.payment.create({
      data: {
        clientId,
        sessionId: sessionId || null,
        amount,
        expectedAmount: expectedAmount || amount,
        paymentType,
        method: method || "CASH",
        status: "PENDING",
        notes: notes || null,
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    // Handle credit balance for ADVANCE payments
    if (paymentType === 'ADVANCE') {
      await prisma.client.update({
        where: { id: clientId },
        data: {
          creditBalance: {
            increment: amount
          }
        }
      });
    }

    // Create task for payment collection (only for partial or unpaid)
    if (paymentType === 'PARTIAL') {
      const remaining = (expectedAmount || amount) - amount;
      await prisma.task.create({
        data: {
          userId: session.user.id,
          type: "COLLECT_PAYMENT",
          title: `גבה יתרת תשלום מ-${client.name} - ₪${remaining}`,
          status: "PENDING",
          priority: "MEDIUM",
          relatedEntityId: payment.id,
          relatedEntity: "Payment",
        },
      });
    }

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("Create payment error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת התשלום" },
      { status: 500 }
    );
  }
}













