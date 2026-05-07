import { NextRequest, NextResponse } from "next/server";
import { processMultiSessionPayment } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;
    const scopeUser = await loadScopeUser(userId);

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

    // CREDIT_CARD חייב לעבור דרך /api/payments/charge-cardcom-bulk (יוצר
    // umbrella Payment + CardcomTransaction ומפעיל סליקה אמיתית). ה-route
    // הזה רושם PAID ידנית בלי לעבור דרך Cardcom, ולכן אסור לקבל פה
    // CREDIT_CARD — defense-in-depth מעל החסימה ב-UI.
    if (method === "CREDIT_CARD") {
      return NextResponse.json(
        {
          message:
            "תשלום באשראי חייב לעבור דרך מסך הסליקה — חזרי לדיאלוג ובחרי 'כרטיס אשראי' שוב.",
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

    // Stage 2.0 — DoS guard: cap על מספר ה-payments בקריאה אחת.
    // 200 הוא חציון בין שימוש לגיטימי (גם לקליניקה גדולה) להגנה מפני
    // body מעוות שגורם ל-IN(...) קטסטרופלי בpostgres.
    if (paymentIds.length > 200) {
      return NextResponse.json(
        { message: "ניתן לעדכן עד 200 תשלומים בקריאה אחת" },
        { status: 400 }
      );
    }
    // ודא ש-paymentIds הם strings תקינים (לא objects/arrays של NoSQL injection)
    if (!paymentIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 100)) {
      return NextResponse.json(
        { message: "מזהי תשלום לא תקינים" },
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
      scopeUser,
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
