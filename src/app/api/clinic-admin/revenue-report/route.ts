// ============================================================================
// M11.G3 — GET /api/clinic-admin/revenue-report?month=YYYY-MM
// ============================================================================
// מחזיר דוח חודשי לבעלי קליניקה: כמה כסף נכנס בפועל בחודש המבוקש, איך
// הוא מתפצל בין הקליניקה לכל מטפל/ת לפי `User.revenueSharePct` (או
// ברירת המחדל הארגונית `Organization.defaultRevenueSharePct`).
//
// אבטחה / multi-tenancy:
// - אימות דרך requireClinicOwner (כולל ADMIN-bypass-removal של M10.5).
// - כל ה-queries מסוננים לפי `organizationId` של ה-OWNER. אין parameter
//   חיצוני ש"בוחר" ארגון — Tenant נקבע מ-DB של המשתמש המחובר בלבד.
// - השדה היחיד שמתקבל מהמשתמש הוא `month` (YYYY-MM), שעובר validation
//   מחמיר ב-regex לפני שמשמש לחישוב גבולות.
// - הקריאה היא read-only.
//
// סינון תשלומים (חשוב — תאם ל-/api/payments/monthly-total):
//  1. `EXCLUDE_BULK_UMBRELLA_WHERE` — מדלג על payments של Cardcom bulk umbrella.
//  2. `parentPaymentId not null OR childPayments none` — מדלג על parent של
//     תשלום מפוצל (אחרת נספור פעם על ה-parent + פעם על ה-children).
//  3. `session.isNot null` — תשלום בלי session אין לו therapistId.
//  4. `status="PAID"` ו-`paidAt` בחלון החודש (Asia/Jerusalem boundaries).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";
import { parseIsraelTime } from "@/lib/date-utils";
import { EXCLUDE_BULK_UMBRELLA_WHERE } from "@/lib/payments/types";
import {
  computeMonthlyRevenueReport,
  monthRangeIsraelToUtc,
  sortByRevenue,
} from "@/lib/clinic/revenue-share";

export const dynamic = "force-dynamic";

const MONTH_REGEX = /^(\d{4})-(\d{2})$/;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    const monthParam = request.nextUrl.searchParams.get("month");
    if (!monthParam || !MONTH_REGEX.test(monthParam)) {
      return NextResponse.json(
        { message: "פרמטר 'month' חובה בפורמט YYYY-MM" },
        { status: 400 }
      );
    }
    const match = monthParam.match(MONTH_REGEX);
    if (!match) {
      return NextResponse.json(
        { message: "פרמטר 'month' לא תקין" },
        { status: 400 }
      );
    }
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      year < 2020 ||
      year > 2100 ||
      month < 1 ||
      month > 12
    ) {
      return NextResponse.json(
        { message: "טווח תאריכים לא תקין" },
        { status: 400 }
      );
    }

    const { monthStartUtc, monthEndUtc } = monthRangeIsraelToUtc(
      year,
      month,
      parseIsraelTime
    );

    const [orgRow, therapists, payments] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { defaultRevenueSharePct: true },
      }),
      prisma.user.findMany({
        where: {
          organizationId,
          clinicRole: "THERAPIST",
          isBlocked: false,
        },
        select: {
          id: true,
          name: true,
          email: true,
          revenueSharePct: true,
        },
        orderBy: [{ name: "asc" }],
      }),
      prisma.payment.findMany({
        where: {
          AND: [
            {
              organizationId,
              session: { isNot: null },
            },
            EXCLUDE_BULK_UMBRELLA_WHERE,
            {
              status: "PAID",
              // דלג על parent של תשלום מפוצל — נספור את ה-children בלבד.
              OR: [
                { parentPaymentId: { not: null } },
                { parentPaymentId: null, childPayments: { none: {} } },
              ],
            },
            {
              paidAt: { gte: monthStartUtc, lt: monthEndUtc },
            },
          ],
        },
        select: {
          amount: true,
          paidAt: true,
          session: { select: { therapistId: true } },
        },
      }),
    ]);

    const orgDefaultPct =
      orgRow?.defaultRevenueSharePct === null ||
      orgRow?.defaultRevenueSharePct === undefined
        ? null
        : Number(orgRow.defaultRevenueSharePct);

    const therapistsInput = therapists.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email ?? "",
      revenueSharePct:
        t.revenueSharePct === null || t.revenueSharePct === undefined
          ? null
          : Number(t.revenueSharePct),
    }));

    // ה-query כבר מסנן payments עם session=null; הסינון כאן הוא defense-in-depth
    // (TypeScript narrowing) + הסרת רשומות עם paidAt=null שלא יקרה בפועל.
    const paymentsInput = payments
      .filter(
        (
          p
        ): p is typeof p & {
          paidAt: Date;
          session: { therapistId: string };
        } => p.paidAt !== null && p.session !== null
      )
      .map((p) => ({
        amount: Number(p.amount) || 0,
        paidAt: p.paidAt,
        therapistId: p.session.therapistId,
      }));

    const report = computeMonthlyRevenueReport({
      therapists: therapistsInput,
      orgDefaultPct,
      payments: paymentsInput,
      monthStartUtc,
      monthEndUtc,
    });

    return NextResponse.json(
      JSON.parse(
        JSON.stringify({
          month: monthParam,
          monthStartUtc: monthStartUtc.toISOString(),
          monthEndUtc: monthEndUtc.toISOString(),
          orgDefaultPct,
          items: sortByRevenue(report.therapists),
          totals: report.totals,
          generatedAt: new Date().toISOString(),
        })
      )
    );
  } catch (error) {
    logger.error("[clinic-admin/revenue-report] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת דוח פיצול הכנסות" },
      { status: 500 }
    );
  }
}
