// ============================================================================
// GET /api/clinic-admin/analytics
// ============================================================================
// אנליטיקת מגמות כלל-קליניקה ל-6 החודשים האחרונים (כולל הנוכחי): פגישות
// שהושלמו, אי-הגעות (NO_SHOW) וביטולים, כולל שיעור אי-הגעה לכל חודש.
//
// המטרה: להשלים את הפער היחיד שאינו מכוסה בדוחות הקיימים —
//  - עומס מטפלים (caseload) מכסה פעילות פר-מטפל.
//  - פיצול הכנסות (revenue-report) מכסה הכנסה פר-מטפל.
//  - דף הדוחות מכסה מגמות הכנסה/פגישות.
// אף אחד מהם אינו מציג *שיעור אי-הגעה לאורך זמן*. זה מה שכאן.
//
// אבטחה / multi-tenancy:
//  - requireClinicOwner — בעלי קליניקה בלבד (כולל הסרת ADMIN-bypass של M10.5).
//  - כל ה-query מסונן ל-organizationId של ה-OWNER מה-DB; אין פרמטר חיצוני
//    שבוחר ארגון. read-only בלבד. ללא PHI (רק startTime + status).
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";
import { parseIsraelTime } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    const now = new Date();

    // שנה/חודש נוכחיים בשעון ישראל (en-CA → "YYYY-MM").
    const ymNow = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
    }).format(now);
    const [cyStr, cmStr] = ymNow.split("-");
    const cy = parseInt(cyStr, 10);
    const cm = parseInt(cmStr, 10);

    // 6 החודשים האחרונים כולל הנוכחי (חוצה גבול-שנה נכון).
    const buckets: { y: number; m: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      let y = cy;
      let m = cm - i;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      buckets.push({ y, m });
    }

    const monthStart = (y: number, m: number) =>
      parseIsraelTime(`${y}-${String(m).padStart(2, "0")}-01`);
    const nextMonth = (y: number, m: number) =>
      m === 12 ? monthStart(y + 1, 1) : monthStart(y, m + 1);

    const rangeStart = monthStart(buckets[0].y, buckets[0].m);
    const rangeEnd = nextMonth(buckets[5].y, buckets[5].m);

    // ללא BREAK, חלון 6 החודשים. רק שדות לא-קליניים (startTime/status).
    const sessions = await prisma.therapySession.findMany({
      where: {
        organizationId,
        type: { not: "BREAK" },
        startTime: { gte: rangeStart, lt: rangeEnd },
      },
      select: { startTime: true, status: true },
    });

    const months = buckets.map(({ y, m }) => {
      const start = monthStart(y, m).getTime();
      const end = nextMonth(y, m).getTime();
      const inMonth = sessions.filter((s) => {
        const t = s.startTime.getTime();
        return t >= start && t < end;
      });
      const completed = inMonth.filter((s) => s.status === "COMPLETED").length;
      const noShow = inMonth.filter((s) => s.status === "NO_SHOW").length;
      const cancelled = inMonth.filter((s) => s.status === "CANCELLED").length;
      // "פגישות שהגיע זמנן" = הושלמו + לא-הגיעו. הבסיס הנכון לשיעור אי-הגעה.
      const due = completed + noShow;
      return {
        label: monthStart(y, m).toLocaleString("he-IL", {
          month: "short",
          timeZone: "Asia/Jerusalem",
        }),
        completed,
        noShow,
        cancelled,
        total: inMonth.length,
        noShowRate: due > 0 ? Math.round((noShow / due) * 100) : 0,
      };
    });

    const totals = months.reduce(
      (acc, mo) => ({
        completed: acc.completed + mo.completed,
        noShow: acc.noShow + mo.noShow,
        cancelled: acc.cancelled + mo.cancelled,
      }),
      { completed: 0, noShow: 0, cancelled: 0 }
    );
    const totalDue = totals.completed + totals.noShow;

    return NextResponse.json({
      months,
      totals: {
        ...totals,
        noShowRate: totalDue > 0 ? Math.round((totals.noShow / totalDue) * 100) : 0,
      },
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    logger.error("[clinic-admin/analytics] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת האנליטיקה" },
      { status: 500 }
    );
  }
}
