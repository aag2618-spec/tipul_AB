import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "לא מורשה" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { amount, description, status, paidAt, invoiceUrl } = body;

    const existingPayment = await prisma.subscriptionPayment.findUnique({
      where: { id },
    });

    if (!existingPayment) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (amount !== undefined) updateData.amount = amount;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (invoiceUrl !== undefined) updateData.invoiceUrl = invoiceUrl;
    if (paidAt !== undefined) updateData.paidAt = paidAt ? new Date(paidAt) : null;

    // Auto-set paidAt when status changes to PAID
    if (status === "PAID" && !existingPayment.paidAt && !paidAt) {
      updateData.paidAt = new Date();
    }

    const payment = await prisma.subscriptionPayment.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Update payment error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון התשלום" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "לא מורשה" }, { status: 403 });
    }

    const { id } = await params;

    const payment = await prisma.subscriptionPayment.findUnique({
      where: { id },
    });

    if (!payment) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    await prisma.subscriptionPayment.delete({
      where: { id },
    });

    return NextResponse.json({ message: "התשלום נמחק בהצלחה" });
  } catch (error) {
    console.error("Delete payment error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת התשלום" },
      { status: 500 }
    );
  }
}
