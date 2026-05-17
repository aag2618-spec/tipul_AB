import { NextRequest, NextResponse } from "next/server";
import { processMultiSessionPayment } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser } from "@/lib/scope";
import { parseBody } from "@/lib/validations/helpers";
import { payClientDebtsSchema } from "@/lib/validations/payment";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;
    const scopeUser = await loadScopeUser(userId);

    // H2: zod (strict) — אוכף סוגי שדות + מסיר שדות לא ידועים שעלולים
    // להיכנס כ-mass assignment לתוך processMultiSessionPayment.
    const parsed = await parseBody(req, payClientDebtsSchema);
    if ("error" in parsed) return parsed.error;
    const {
      clientId,
      paymentIds,
      totalAmount,
      method,
      paymentMode,
      creditUsed = 0,
      issueReceipt = true,
    } = parsed.data;

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
