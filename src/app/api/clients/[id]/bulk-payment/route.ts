import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { createPaymentForSession, processMultiSessionPayment } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import {
  buildClientWhere,
  buildSessionWhere,
  isSecretary,
  loadScopeUser,
  secretaryCan,
} from "@/lib/scope";

export const dynamic = "force-dynamic";

// Stage 2.0 — Zod schema לתשלום מצרפי. amount חיובי בלבד, method מ-enum סגור.
// שני הבדיקות היו קיימות בעבר באופן ידני; Zod מחליף אותן וגם דוחה body מעוות
// (e.g. amount: { $gt: 0 } — NoSQL-style operator injection).
const BulkPaymentSchema = z.object({
  amount: z.number().positive("הסכום חייב להיות חיובי").max(1_000_000),
  method: z.enum(["CASH", "CREDIT_CARD", "BANK_TRANSFER", "CHECK", "CREDIT", "OTHER"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id: clientId } = await params;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ message: "גוף הבקשה לא תקין" }, { status: 400 });
    }

    const parsed = BulkPaymentSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { message: firstIssue?.message ?? "נתונים לא תקינים" },
        { status: 400 }
      );
    }
    const { amount, method } = parsed.data;

    const scopeUser = await loadScopeUser(userId);
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
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

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
        { message: "No sessions to pay" },
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
          userId: userId,
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
      userId: userId,
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
        userId: userId,
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
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
