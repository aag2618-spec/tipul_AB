import { NextRequest, NextResponse } from "next/server";
import { processMultiSessionPayment } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const {
      clientId,
      paymentIds,
      totalAmount,
      method,
      paymentMode,
      creditUsed = 0,
      issueReceipt = true,
    } = await req.json();

    if (!clientId || !paymentIds || !totalAmount || !method) {
      return NextResponse.json({ message: "חסרים פרמטרים" }, { status: 400 });
    }

    const validMethods = ["CASH", "CREDIT_CARD", "BANK_TRANSFER", "CHECK", "CREDIT", "OTHER"];
    if (!validMethods.includes(method)) {
      return NextResponse.json({ message: "אמצעי תשלום לא תקין" }, { status: 400 });
    }

    // CRITICAL: CREDIT_CARD בתשלום מצרפי לא נתמך כרגע. ה-route הזה רושם
    // PAID ידנית על מספר Payments — ל-Cardcom צריך מסלול נפרד עם
    // umbrella payment + עדכון אטומי ב-webhook. עד שהמנגנון יוטמע
    // נחסום כאן (defense-in-depth מעל החסימה ב-UI).
    if (method === "CREDIT_CARD") {
      return NextResponse.json(
        {
          message:
            "תשלום מצרפי באשראי טרם נתמך. בצעי סליקה לכל פגישה בנפרד, או בחרי אמצעי תשלום אחר.",
        },
        { status: 400 }
      );
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
      userId: userId,
      clientId,
      paymentIds,
      totalAmount: Number(totalAmount),
      method,
      paymentMode: paymentMode || "FULL",
      creditUsed: Number(creditUsed) || undefined,
      issueReceipt,
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
    logger.error("Pay client debts error:", { error: error instanceof Error ? error.message : String(error) });
    const errorMessage =
      error instanceof Error ? error.message : "שגיאה בעיבוד התשלום";
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
