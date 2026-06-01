import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { getEffectivePrice } from "@/lib/pricing/effective-price";
import { getOrgMonthlySmsQuota, getOrgMonthlySmsUsage } from "@/lib/clinic/sms-quota";
import { EXCLUDE_BULK_UMBRELLA_WHERE } from "@/lib/payments/types";
import { calculatePaidAmount } from "@/lib/payment-utils";
import { getIsraelDayBoundsUtc, getIsraelMonthBoundsUtc } from "@/lib/timezone";

export const dynamic = "force-dynamic";

// GET — סקירה מהירה לדף overview של בעל קליניקה.
// מחזיר: ארגון, ספירות חברים/מטופלים/פגישות, מחיר אפקטיבי, מכסת SMS.
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, clinicRole: true, organizationId: true },
    });

    if (!user) {
      return NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 });
    }

    // M10.5: ADMIN גלובלי משתמש ב-/api/admin/* בלבד; אסור bypass כאן.
    const isOwner = user.role === "CLINIC_OWNER" || user.clinicRole === "OWNER";
    if (!isOwner) {
      return NextResponse.json(
        { message: "אין הרשאה" },
        { status: 403 }
      );
    }
    if (!user.organizationId) {
      return NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 404 }
      );
    }

    const orgId = user.organizationId;

    const [org, members, clientsCount, sessionsCount, transfersCount] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          name: true,
          subscriptionStatus: true,
          aiTier: true,
          pricingPlan: { select: { name: true, baseFeeIls: true } },
          customContract: {
            select: { id: true, monthlyEquivPriceIls: true, endDate: true },
          },
        },
      }),
      prisma.user.groupBy({
        by: ["clinicRole"],
        where: { organizationId: orgId, isBlocked: false },
        _count: { _all: true },
      }),
      prisma.client.count({ where: { organizationId: orgId } }),
      prisma.therapySession.count({ where: { organizationId: orgId } }),
      prisma.clientTransferLog.count({ where: { organizationId: orgId } }),
    ]);

    if (!org) {
      return NextResponse.json({ message: "הקליניקה לא נמצאה" }, { status: 404 });
    }

    const counts = {
      owners: members.find((m) => m.clinicRole === "OWNER")?._count._all ?? 0,
      therapists: members.find((m) => m.clinicRole === "THERAPIST")?._count._all ?? 0,
      secretaries: members.find((m) => m.clinicRole === "SECRETARY")?._count._all ?? 0,
      clients: clientsCount,
      sessions: sessionsCount,
      transfers: transfersCount,
    };

    // ── KPIs ניהוליים — נתוני "כאן ועכשיו" לבעל/ת הקליניקה (scope ארגוני) ──
    const now = new Date();
    const today = getIsraelDayBoundsUtc(now);
    const month = getIsraelMonthBoundsUtc(now);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [todaySessions, noShowsThisMonth, pendingSummaries, openPayments] =
      await Promise.all([
        // פגישות מתוכננות/פעילות היום בקליניקה (ללא ביטולים והפסקות).
        prisma.therapySession.count({
          where: {
            organizationId: orgId,
            startTime: { gte: today.start, lt: today.end },
            status: { not: "CANCELLED" },
            type: { not: "BREAK" },
          },
        }),
        // אי-הופעות החודש.
        prisma.therapySession.count({
          where: {
            organizationId: orgId,
            startTime: { gte: month.start, lt: month.end },
            status: "NO_SHOW",
          },
        }),
        // פגישות שהושלמו וממתינות לסיכום (30 הימים האחרונים) — מצב כלל-הקליניקה.
        prisma.therapySession.count({
          where: {
            organizationId: orgId,
            startTime: { gte: thirtyDaysAgo },
            status: "COMPLETED",
            skipSummary: { not: true },
            type: { not: "BREAK" },
            sessionNote: { is: null },
          },
        }),
        // תשלומים פתוחים — לחישוב סך החוב. נבחרים השדות שמזינים את
        // calculatePaidAmount הקנוני (method/hasReceipt/children) כדי שהחישוב
        // יהיה זהה ל-getAllClientsDebtSummary שמזין את "סך החוב" בדשבורד.
        prisma.payment.findMany({
          where: {
            AND: [
              { organizationId: orgId },
              EXCLUDE_BULK_UMBRELLA_WHERE,
              { status: "PENDING", parentPaymentId: null },
            ],
          },
          select: {
            amount: true,
            expectedAmount: true,
            status: true,
            method: true,
            hasReceipt: true,
            childPayments: {
              where: { status: "PAID" },
              select: { amount: true, status: true },
            },
          },
        }),
      ]);

    // סך חובות פתוחים — paidAmount הקנוני (calculatePaidAmount) מטפל נכון
    // ב-placeholder של אשראי ממתין (PENDING+CC ללא קבלה = שולם 0), בדיוק כמו
    // getAllClientsDebtSummary. בלי זה, חיוב אשראי טרי (amount===expected,
    // hasReceipt=false) היה נושר מהספירה והחוב היה מוצג בחֶסֶר.
    const openDebtsIls = openPayments.reduce((sum, p) => {
      const expected = Number(p.expectedAmount) || 0;
      if (expected <= 0) return sum;
      const paid = calculatePaidAmount(p);
      return paid < expected ? sum + (expected - paid) : sum;
    }, 0);

    const kpis = {
      todaySessions,
      noShowsThisMonth,
      pendingSummaries,
      openDebtsIls,
    };

    const effectivePriceResult = await getEffectivePrice(orgId);
    const effectivePrice = "error" in effectivePriceResult ? null : effectivePriceResult;

    let smsUsage: { quota: number; used: number; remaining: number } | null = null;
    try {
      const [quota, used] = await Promise.all([
        getOrgMonthlySmsQuota(orgId),
        getOrgMonthlySmsUsage(orgId),
      ]);
      smsUsage = {
        quota,
        used,
        remaining: Math.max(0, quota - used),
      };
    } catch {
      // אם נכשל — לא קריטי, פשוט לא מציגים
    }

    return NextResponse.json(
      JSON.parse(
        JSON.stringify({
          organization: org,
          counts,
          kpis,
          effectivePrice,
          smsUsage,
        })
      )
    );
  } catch (error) {
    logger.error("[clinic-admin/overview] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת הסקירה" },
      { status: 500 }
    );
  }
}
