import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getIsraelYear, getIsraelMonth } from "@/lib/date-utils";
import { requireAuth } from "@/lib/api-auth";
import { buildPaymentWhere, loadScopeUser } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { shouldScopePersonal } from "@/lib/view-scope";
import { EXCLUDE_BULK_UMBRELLA_WHERE } from "@/lib/payments/types";
import { getAllClientsDebtSummary } from "@/lib/payment-service";
import { paymentRevenueContribution, isRollupParentPayment } from "@/lib/payment-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUserWithMode(userId);
    // היקף לפי המתג הגלובלי "שלי / כל הקליניקה" (cookie, נשלח אוטומטית בבקשה).
    const personalOnly = await shouldScopePersonal(scopeUser);
    const paymentWhere = buildPaymentWhere(scopeUser, { personalOnly });

    const monthsParam = 6;
    const windowStart = new Date();
    windowStart.setDate(1);
    windowStart.setMonth(windowStart.getMonth() - monthsParam);
    windowStart.setHours(0, 0, 0, 0);

    const [clientDebts, monthlyPayments, historyPayments] = await Promise.all([
      getAllClientsDebtSummary(userId, scopeUser, { personalOnly }),

      prisma.payment.findMany({
        where: {
          AND: [
            paymentWhere,
            EXCLUDE_BULK_UMBRELLA_WHERE,
            {
              status: "PAID",
              OR: [
                { parentPaymentId: { not: null } },
                { parentPaymentId: null, childPayments: { none: {} } },
                // הורים-מגלגלים: לתפוס "חלק-אב" בתשלום מפוצל (אשראי על האב).
                { parentPaymentId: null, childPayments: { some: {} } },
              ],
            },
            {
              OR: [
                { paidAt: { gte: windowStart } },
                { paidAt: null, createdAt: { gte: windowStart } },
              ],
            },
          ],
        },
        select: { amount: true, paidAt: true, createdAt: true, parentPaymentId: true, childPayments: { select: { amount: true, status: true } } },
      }),

      prisma.payment.findMany({
        where: {
          AND: [
            paymentWhere,
            EXCLUDE_BULK_UMBRELLA_WHERE,
            { status: "PAID", parentPaymentId: null },
          ],
        },
        take: 51,
        include: {
          client: { select: { id: true, name: true, firstName: true, lastName: true } },
          session: { select: { id: true, startTime: true, type: true } },
          childPayments: {
            select: { id: true, amount: true, method: true, paidAt: true, createdAt: true, receiptNumber: true, receiptUrl: true, hasReceipt: true },
            orderBy: { paidAt: "asc" as const },
          },
        },
        orderBy: { paidAt: "desc" },
      }),
    ]);

    // דחיות חוב פעילות (snoozeUntil עתידי) — להצגת תווית "נדחה עד" בכרטיס
    // המטופל. המטופל נשאר ברשימה (עדיין חייב), רק לא נספר בעיגול שבתפריט.
    // עטוף ב-try/catch כרשת ביטחון: אם הטבלה עדיין לא קיימת (לפני db push),
    // הדף ממשיך לעבוד בלי דחיות במקום להיכשל (אותו דפוס כמו overlaps GET).
    const snoozeMap = new Map<string, Date>();
    try {
      if (clientDebts.length) {
        const snoozes = await prisma.snoozedDebt.findMany({
          where: {
            clientId: { in: clientDebts.map((d) => d.id) },
            snoozeUntil: { gt: new Date() },
          },
          select: { clientId: true, snoozeUntil: true },
        });
        for (const s of snoozes) snoozeMap.set(s.clientId, s.snoozeUntil);
      }
    } catch (e) {
      logger.warn("SnoozedDebt query failed (table missing before db push?)", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    const clientDebtsWithSnooze = clientDebts.map((d) => ({
      ...d,
      snoozeUntil: snoozeMap.get(d.id) ?? null,
    }));

    // --- Monthly ---
    const now = new Date();
    const israelYear = getIsraelYear(now);
    const israelMonth = getIsraelMonth(now);

    const thisMonthPaid = monthlyPayments.filter((p) => {
      const d = p.paidAt || p.createdAt;
      return getIsraelYear(d) === israelYear && getIsraelMonth(d) === israelMonth;
    });
    // sum: הורה-מגלגל → רק חלק-האב (האשראי המפוצל); אחרת amount. count: בלי
    // הורים-מגלגלים (הילדים נספרים בנפרד) — נשאר זהה להתנהגות הקודמת.
    const monthlyTotal = thisMonthPaid.reduce((sum, p) => sum + paymentRevenueContribution(p), 0);
    const thisMonthCount = thisMonthPaid.filter((p) => !isRollupParentPayment(p)).length;

    const breakdown = [];
    for (let i = monthsParam - 1; i >= 0; i--) {
      const targetMonthZeroIdx = israelMonth - 1 - i;
      const yearOffset = Math.floor(targetMonthZeroIdx / 12);
      const tMonth = ((targetMonthZeroIdx % 12) + 12) % 12 + 1;
      const tYear = israelYear + yearOffset;
      const mp = monthlyPayments.filter((p) => {
        const d = p.paidAt || p.createdAt;
        return getIsraelYear(d) === tYear && getIsraelMonth(d) === tMonth;
      });
      breakdown.push({ month: `${tYear}-${String(tMonth).padStart(2, "0")}`, total: mp.reduce((s, p) => s + paymentRevenueContribution(p), 0), count: mp.filter((p) => !isRollupParentPayment(p)).length });
    }

    // --- History ---
    const hasMore = historyPayments.length > 50;
    const trimmed = hasMore ? historyPayments.slice(0, 50) : historyPayments;

    const historyItems = trimmed
      .filter((p) => {
        const amount = Number(p.amount);
        const expected = p.expectedAmount ? Number(p.expectedAmount) : amount;
        return amount >= expected;
      })
      .map((payment) => {
        const firstChildReceipt = payment.childPayments?.find((c) => c.hasReceipt);
        return {
          id: payment.id,
          clientId: payment.client.id,
          clientName: payment.client.firstName && payment.client.lastName
            ? `${payment.client.firstName} ${payment.client.lastName}`
            : payment.client.name,
          amount: Number(payment.amount),
          expectedAmount: payment.expectedAmount ? Number(payment.expectedAmount) : Number(payment.amount),
          method: payment.method,
          status: payment.status,
          paidAt: payment.paidAt,
          createdAt: payment.createdAt,
          receiptNumber: payment.receiptNumber || firstChildReceipt?.receiptNumber || null,
          receiptUrl: payment.receiptUrl || firstChildReceipt?.receiptUrl || null,
          hasReceipt: payment.hasReceipt || !!firstChildReceipt?.hasReceipt,
          session: payment.session ? { id: payment.session.id, startTime: payment.session.startTime, type: payment.session.type } : null,
          childPayments: payment.childPayments?.map((c) => ({
            id: c.id, amount: Number(c.amount), method: c.method || payment.method, paidAt: c.paidAt, createdAt: c.createdAt,
          })) || [],
        };
      });

    return NextResponse.json({
      debts: clientDebtsWithSnooze,
      monthly: { total: monthlyTotal, count: thisMonthCount, breakdown },
      history: { items: historyItems, hasMore, nextSkip: trimmed.length },
    });
  } catch (error) {
    logger.error("Payments dashboard error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ message: "שגיאה בטעינת נתוני תשלומים" }, { status: 500 });
  }
}
