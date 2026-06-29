import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createPaymentForSession } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { buildClientWhere, isSecretary, secretaryCan } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
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
    const scopeUser = await loadScopeUserWithMode(userId);

    // Phase 3 L1: מזכירה ללא canViewPayments לא רשאית ליצור רשומת Payment
    // (גם לא ADVANCE/קרדיט). analog ל-H1 שסגרנו ב-/api/payments/pay-client-debts:
    // הוספת קרדיט יוצרת Payment דרך createPaymentForSession, וזו פעולה פיננסית
    // לכל דבר. בלי הגייט הזה בקשה ישירה (Postman/script/UI ישן) יכלה לעקוף את
    // ה-UI שכבר מסתיר את הכפתור מתחת ל-canViewPayments.
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewPayments")) {
      return NextResponse.json(
        { message: "אין הרשאה לפעולות תשלום" },
        { status: 403 }
      );
    }

    // Defense-in-depth: בדיקת ownership מפורשת על מזהה המטופל מה-URL, עקבית עם
    // שאר מסלולי [id]. כיום הבידוד הרב-ארגוני נשען עקיפות על scopeUser שמועבר
    // ל-createPaymentForSession; הבדיקה כאן מבטיחה שה-route לא יישבר ל-IDOR
    // פיננסי אם מימוש ה-service ישתנה בעתיד.
    const ownedClient = await prisma.client.findFirst({
      where: { AND: [{ id }, buildClientWhere(scopeUser)] },
      select: { id: true },
    });
    if (!ownedClient) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

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
