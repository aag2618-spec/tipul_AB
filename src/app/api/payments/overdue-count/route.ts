import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAllClientsDebtSummary } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { DEBT_OVERDUE_DAYS } from "@/lib/payment-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/overdue-count
 *
 * מחזיר { count } — מספר המטופלים עם חוב "חורג": הפגישה הלא-משולמת הוותיקה
 * ביותר עברה את DEBT_OVERDUE_DAYS. מטופל שהחוב שלו נדחה ידנית (SnoozedDebt עם
 * snoozeUntil עתידי) מסונן החוצה. מזין את העיגול שליד "תשלומים" בתפריט.
 *
 * בידוד PHI/scope: getAllClientsDebtSummary בונה את ה-where דרך
 * buildPaymentWhere(scopeUser) — מזכירה בלי canViewPayments מקבלת deny-filter
 * ולכן רשימה ריקה → count=0, בלי צורך ב-gate נוסף.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUserWithMode(userId);
    const debts = await getAllClientsDebtSummary(userId, scopeUser);
    if (debts.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    const now = Date.now();
    const cutoff = now - DEBT_OVERDUE_DAYS * 24 * 60 * 60 * 1000;

    // מטופלים שהחוב שלהם נדחה (snoozeUntil עתידי) — מסוננים החוצה מהספירה.
    // עטוף ב-try/catch: אם הטבלה עדיין לא קיימת (לפני db push), פשוט אין דחיות
    // (נספור את כל החובות החורגים) במקום להחזיר 0 על הכל.
    const snoozedSet = new Set<string>();
    try {
      const snoozed = await prisma.snoozedDebt.findMany({
        where: {
          clientId: { in: debts.map((d) => d.id) },
          snoozeUntil: { gt: new Date(now) },
        },
        select: { clientId: true },
      });
      for (const s of snoozed) snoozedSet.add(s.clientId);
    } catch {
      // טבלה חסרה — אין דחיות פעילות.
    }

    const count = debts.filter(
      (d) =>
        !snoozedSet.has(d.id) &&
        d.unpaidSessions.some((s) => new Date(s.date).getTime() <= cutoff)
    ).length;

    return NextResponse.json({ count });
  } catch (error) {
    logger.error("Overdue payments count error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    // לא לשבור את התפריט — מחזירים 0 בשגיאה (polling שקט).
    return NextResponse.json({ count: 0 });
  }
}
