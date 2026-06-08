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
// סינון תשלומים:
//  1. `EXCLUDE_BULK_UMBRELLA_WHERE` — מדלג על payments של Cardcom bulk umbrella.
//  2. `parentPaymentId = null` — סופרים רק תשלומי-אב. תשלום-משנה (ילד) של
//     תשלום מפוצל/חלקי אינו נושא sessionId, ולכן אי-אפשר לשייכו למטפל/ת;
//     הסכום שלו ממילא מגולגל ב-parent.amount (כולל חלק האשראי בתשלום מפוצל).
//     לתשלום-אב ששולם, parent.amount = סך ההכנסה המלא לפגישה (נטו אחרי החזר).
//  3. `session.isNot null` — תשלום בלי session אין לו therapistId.
//  4. `status="PAID"` ו-`paidAt` בחלון החודש (Asia/Jerusalem boundaries).
//  שיוך-חודש: לתשלום-אב מגלגל (מפוצל/מרובה-פעימות) הסכום המלא משויך לחודש
//  של parent.paidAt (מועד השלמת התשלום). תשלום מפוצל אשראי+מזומן נעשה ברוב
//  המקרים באותו יום ⇒ מדויק. פעימות מזומן שחוצות גבול-חודש ירוכזו בחודש
//  ההשלמה — עדיין מדויק יותר מהקודם, שהשמיט אותן מהדוח לחלוטין (לילד אין
//  session ולכן לא ניתן לפזרו לפי החודש שלו תוך שיוך למטפל/ת).
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
import { effectiveBillingMode } from "@/lib/clinic/billing-mode";

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
        select: { defaultRevenueSharePct: true, therapistDebtTracking: true },
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
          clinicBillingMode: true,
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
              // רק תשלומי-אב. ילד לא נושא sessionId ⇒ לא ניתן לשייכו למטפל/ת,
              // והסכום שלו כבר מגולגל ב-parent.amount. ספירת ילדים בנפרד
              // הפילה מהדוח כל פגישה ששולמה בכמה פעימות (כולל אשראי+מזומן מפוצל).
              parentPaymentId: null,
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

    // מצב הסליקה לכל מטפל/ת — כדי שהדוח יסמן שעבור מטפל/ת ב-OWN, clinicRevenueIls
    // הוא סכום שהמטפל/ת *חייב/ת להעביר* לקליניקה (גבה לחשבונו/ה), בעוד שב-CLINIC
    // הכסף כבר אצל הקליניקה. תצוגה בלבד — לא משנה את החישוב. null (legacy) נגזר
    // לפי קיום מסוף פרטי פעיל, בעקביות עם resolveCardcomBilling ומסך המנהלת.
    const therapistIds = therapists.map((t) => t.id);
    const activeCardcom = therapistIds.length
      ? await prisma.billingProvider.findMany({
          where: {
            userId: { in: therapistIds },
            provider: "CARDCOM",
            isActive: true,
          },
          select: { userId: true },
        })
      : [];
    const connectedSet = new Set(activeCardcom.map((r) => r.userId));
    const rawModeById = new Map(
      therapists.map((t) => [t.id, t.clinicBillingMode])
    );

    return NextResponse.json(
      JSON.parse(
        JSON.stringify({
          month: monthParam,
          monthStartUtc: monthStartUtc.toISOString(),
          monthEndUtc: monthEndUtc.toISOString(),
          orgDefaultPct,
          therapistDebtTracking: orgRow?.therapistDebtTracking ?? false,
          items: sortByRevenue(report.therapists).map((r) => ({
            ...r,
            clinicBillingMode: effectiveBillingMode(
              rawModeById.get(r.therapistId),
              connectedSet.has(r.therapistId)
            ),
          })),
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
