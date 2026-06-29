import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createPaymentForSession, processMultiSessionPayment } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import {
  buildClientWhere,
  buildSessionWhere,
  isSecretary,
  secretaryCan,
} from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { parseBody } from "@/lib/validations/helpers";
import { bulkPaymentSchema } from "@/lib/validations/misc";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id: clientId } = await params;

    const parsed = await parseBody(request, bulkPaymentSchema);
    if ("error" in parsed) return parsed.error;
    const { amount, method } = parsed.data;

    const scopeUser = await loadScopeUserWithMode(userId);
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewPayments")) {
      return NextResponse.json(
        { message: "אין הרשאה לצפייה/יצירת תשלומים" },
        { status: 403 }
      );
    }
    const clientWhere = buildClientWhere(scopeUser);
    const sessionWhere = buildSessionWhere(scopeUser);

    // CREDIT_CARD חייב לעבור דרך /api/payments/charge-cardcom-bulk (סליקה
    // אמיתית עם umbrella + webhook). ה-route הזה רושם PAID ידנית, אז
    // CREDIT_CARD פה אסור — defense-in-depth מעל החסימה ב-UI.
    if ((method as string) === "CREDIT_CARD") {
      return NextResponse.json(
        {
          message:
            "תשלום באשראי חייב לעבור דרך מסך הסליקה — חזרי לדיאלוג ובחרי 'כרטיס אשראי' שוב.",
        },
        { status: 400 }
      );
    }

    const client = await prisma.client.findFirst({
      where: { AND: [{ id: clientId }, clientWhere] },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // ⚠️ הקבלה חייבת לשאת את זהות המטפל בעל הלקוח (billing owner), לא של המבצע
    // (מזכירה/מנהלת). תואם POST /api/payments. בלי זה הקבלה יוצאת על המבצע
    // (או לא יוצאת כלל אם businessType=NONE), והמייל/העותק הולכים אליו במקום למטפל.
    const billingUserId = client.therapistId ?? userId;

    // Find unpaid/partially-paid completed sessions (oldest first)
    const sessions = await prisma.therapySession.findMany({
      where: {
        AND: [
          sessionWhere,
          {
            clientId,
            status: "COMPLETED",
            type: { not: "BREAK" },
            OR: [
              { payment: null },
              { payment: { status: "PENDING" } },
            ],
          },
        ],
      },
      include: { payment: true },
      orderBy: { startTime: "asc" },
    });

    if (sessions.length === 0) {
      return NextResponse.json(
        { message: "אין פגישות לחיוב" },
        { status: 400 }
      );
    }

    // Ensure every session has a payment record; collect IDs
    const paymentIds: string[] = [];
    for (const s of sessions) {
      if (s.payment) {
        paymentIds.push(s.payment.id);
      } else {
        const result = await createPaymentForSession({
          userId: billingUserId,
          clientId,
          sessionId: s.id,
          amount: 0,
          expectedAmount: Number(s.price),
          method: "CASH",
          paymentType: "FULL",
          scopeUser,
        });
        if (result.success && result.payment) {
          paymentIds.push(result.payment.id);
        }
      }
    }

    const result = await processMultiSessionPayment({
      userId: billingUserId,
      clientId,
      paymentIds,
      totalAmount: Number(amount),
      method,
      paymentMode: "FULL",
      scopeUser,
    });

    if (!result.success) {
      return NextResponse.json({ message: result.error }, { status: 500 });
    }

    // Surplus goes to credit — via trunk for audit trail
    if (result.remainingAmount > 0) {
      await createPaymentForSession({
        userId: billingUserId,
        clientId,
        amount: result.remainingAmount,
        expectedAmount: result.remainingAmount,
        method,
        paymentType: "ADVANCE",
        issueReceipt: false,
        notes: `עודף מתשלום מרוכז — נוסף לקרדיט`,
        scopeUser,
      });
    }

    return NextResponse.json({
      success: true,
      sessionsUpdated: result.updatedPayments,
      remainingCredit: result.remainingAmount,
      message:
        result.remainingAmount > 0
          ? `קוזזו ${result.updatedPayments} פגישות. ₪${result.remainingAmount.toFixed(2)} נוסף לקרדיט`
          : `קוזזו ${result.updatedPayments} פגישות בהצלחה`,
    });
  } catch (error) {
    logger.error("Error processing bulk payment:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בעיבוד התשלום" },
      { status: 500 }
    );
  }
}
