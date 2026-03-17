import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { processMultiSessionPayment } from "@/lib/payment-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

    const {
      clientId,
      paymentIds,
      totalAmount,
      method,
      paymentMode,
      creditUsed = 0,
    } = await req.json();

    if (!clientId || !paymentIds || !totalAmount || !method) {
      return NextResponse.json({ message: "חסרים פרמטרים" }, { status: 400 });
    }

    const validMethods = ["CASH", "CREDIT_CARD", "BANK_TRANSFER", "CHECK", "CREDIT", "OTHER"];
    if (!validMethods.includes(method)) {
      return NextResponse.json({ message: "אמצעי תשלום לא תקין" }, { status: 400 });
    }

    if (totalAmount <= 0) {
      return NextResponse.json(
        { message: "סכום התשלום חייב להיות חיובי" },
        { status: 400 }
      );
    }

    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      return NextResponse.json(
        { message: "אין תשלומים לעדכון" },
        { status: 400 }
      );
    }

    const result = await processMultiSessionPayment({
      userId: session.user.id,
      clientId,
      paymentIds,
      totalAmount: Number(totalAmount),
      method,
      paymentMode: paymentMode || "FULL",
      creditUsed: Number(creditUsed) || undefined,
    });

    if (!result.success) {
      return NextResponse.json({ message: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      updatedPayments: result.updatedPayments,
      totalPaid: result.totalPaid,
    });
  } catch (error) {
    console.error("Pay client debts error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "שגיאה בעיבוד התשלום";
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
