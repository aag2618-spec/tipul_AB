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
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    const payment = await prisma.payment.findFirst({
      where: { id, client: { therapistId: session.user.id } },
      include: {
        client: true,
        session: true,
      },
    });

    if (!payment) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Get payment error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת התשלום" },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const { status, method, notes, paidAt, useCredit } = body;

    console.log("Payment update request:", { id, status, method, useCredit, paidAt });

    const existingPayment = await prisma.payment.findFirst({
      where: { id, client: { therapistId: session.user.id } },
      include: { client: true }
    });

    if (!existingPayment) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    console.log("Existing payment:", { 
      id: existingPayment.id, 
      amount: existingPayment.amount,
      currentStatus: existingPayment.status,
      clientCredit: existingPayment.client.creditBalance 
    });

    // Handle credit usage
    if (useCredit && status === "PAID") {
      console.log("Processing credit payment...");
      const client = existingPayment.client;
      const paymentAmount = Number(existingPayment.amount);
      
      if (Number(client.creditBalance) >= paymentAmount) {
        // Deduct from credit balance
        await prisma.client.update({
          where: { id: client.id },
          data: {
            creditBalance: {
              decrement: paymentAmount
            }
          }
        });
      } else {
        return NextResponse.json(
          { message: "אין מספיק קרדיט" },
          { status: 400 }
        );
      }
    }

    const payment = await prisma.payment.update({
      where: { id },
      data: {
        status: status || undefined,
        method: method || undefined,
        notes: notes !== undefined ? notes : undefined,
        paidAt: status === "PAID" ? paidAt || new Date() : undefined,
      },
    });

    // Complete related task if paid
    if (status === "PAID") {
      await prisma.task.updateMany({
        where: {
          userId: session.user.id,
          relatedEntityId: id,
          type: "COLLECT_PAYMENT",
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        data: { status: "COMPLETED" },
      });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Update payment error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון התשלום" },
      { status: 500 }
    );
  }
}













