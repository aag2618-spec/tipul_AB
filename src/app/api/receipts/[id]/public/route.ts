import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyReceiptToken } from "@/lib/receipt-token";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.nextUrl.searchParams.get("t");

    if (!token || token.length !== 24) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    try {
      if (!verifyReceiptToken(id, token)) {
        return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        client: { select: { name: true } },
        session: { select: { startTime: true, type: true } },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "קבלה לא נמצאה" }, { status: 404 });
    }

    const therapist = await prisma.user.findFirst({
      where: { clients: { some: { id: payment.clientId } } },
      select: {
        name: true,
        businessName: true,
        businessPhone: true,
        businessAddress: true,
      },
    });

    const amount = Number(payment.amount);
    const expectedAmount = Number(payment.expectedAmount || payment.amount);
    const isPartial = amount < expectedAmount;

    return NextResponse.json({
      receiptNumber: payment.receiptNumber,
      amount,
      expectedAmount,
      method: payment.method,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      clientName: payment.client.name,
      sessionDate: payment.session?.startTime || null,
      receiptUrl: payment.receiptUrl,
      isPartial,
      remaining: isPartial ? expectedAmount - amount : 0,
      therapist: {
        name: therapist?.name || "",
        businessName: therapist?.businessName || "",
        phone: therapist?.businessPhone || "",
        address: therapist?.businessAddress || "",
      },
    });
  } catch (error) {
    console.error("Public receipt error:", error);
    return NextResponse.json({ error: "שגיאה בטעינת הקבלה" }, { status: 500 });
  }
}
