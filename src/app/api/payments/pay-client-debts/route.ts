import { NextRequest, NextResponse } from "next/server";
import { processMultiSessionPayment } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { isSecretary, loadScopeUser, secretaryCan } from "@/lib/scope";
import { parseBody } from "@/lib/validations/helpers";
import { payClientDebtsSchema } from "@/lib/validations/payment";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;
    const scopeUser = await loadScopeUser(userId);

    // Phase 3 (H1): סגירת backdoor — מזכירה ללא canViewPayments יכלה לסמן
    // payments PAID דרך ה-route הזה גם כש-PUT /api/sessions/[id] חוסם
    // markAsPaid. השרשרת היתה: סמן COMPLETED → אוטו-יצירת PENDING (amount=0)
    // → קריאת paymentId מ-/api/sessions/calendar (M1) → POST כאן → מסומן PAID.
    // ה-gate הזה חוסם את הקצה האחרון של השרשרת; M1 (calendar) סוגר את
    // הקצה השני. תאם ל-POST /api/payments ו-PUT /api/payments/[id] שכבר אוכפים
    // את אותה הרשאה.
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewPayments")) {
      return NextResponse.json(
        { message: "אין הרשאה לפעולות תשלום" },
        { status: 403 }
      );
    }

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
