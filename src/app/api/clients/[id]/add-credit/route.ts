import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createPaymentForSession } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser } from "@/lib/scope";
import { parseBody } from "@/lib/validations/helpers";
import { addCreditSchema } from "@/lib/validations/client";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;
    // H12: zod אוכף amount חיובי (≤1M) + cap על notes (500 תווים).
    const parsed = await parseBody(request, addCreditSchema);
    if ("error" in parsed) return parsed.error;
    const { amount, notes } = parsed.data;

    // טען scope לפי המשתמש כדי לוודא שה-Payment החדש משויך ל-organizationId
    // הנכון (אחרת ה-Payment שנוצר בלי organizationId לא ייראה לבעלי הקליניקה).
    const scopeUser = await loadScopeUser(userId);

    const result = await createPaymentForSession({
      userId: userId,
      clientId: id,
      amount: Number(amount),
      expectedAmount: Number(amount),
      method: "CREDIT",
      paymentType: "ADVANCE",
      notes: notes || `הוספת קרדיט: ₪${amount}`,
      scopeUser,
    });

    if (!result.success) {
      return NextResponse.json({ message: result.error }, { status: 400 });
    }

    const updatedClient = await prisma.client.findUnique({
      where: { id },
      select: { creditBalance: true },
    });

    return NextResponse.json({
      message: "הקרדיט נוסף בהצלחה",
      newBalance: Number(updatedClient?.creditBalance || 0),
    });
  } catch (error) {
    logger.error("Add credit error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בהוספת קרדיט" },
      { status: 500 }
    );
  }
}
