import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { ReportsView, type ReportData } from "@/components/reports/reports-view";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { getIsraelYear, parseIsraelTime } from "@/lib/date-utils";
import { EXCLUDE_BULK_UMBRELLA_WHERE } from "@/lib/payments/types";
import {
  loadScopeUser,
  buildClientWhere,
  buildSessionWhere,
  buildPaymentWhere,
  isSecretary,
  secretaryCan,
  type ScopeUser,
} from "@/lib/scope";

const hebrewDays = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

async function getReportData(scopeUser: ScopeUser): Promise<ReportData> {
  const clientWhere = buildClientWhere(scopeUser);
  const sessionWhere = buildSessionWhere(scopeUser);
  const paymentWhere = buildPaymentWhere(scopeUser);
  try {
    // yearStart — 1 בינואר של השנה הישראלית הנוכחית, בשעון ישראל
    const now = new Date();
    const israelYear = getIsraelYear(now);
    const yearStart = parseIsraelTime(`${israelYear}-01-01`);
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const [
      allSessions,
      allPayments,
      allNewClients,
      totalClients,
      clientStatusData,
      activeWithRecent,
      totalNonArchived,
    ] = await Promise.all([
      prisma.therapySession.findMany({
        where: {
          AND: [
            sessionWhere,
            { startTime: { gte: yearStart }, type: { not: "BREAK" } },
          ],
        },
        select: { startTime: true, status: true, type: true },
      }),
      prisma.payment.findMany({
        where: {
          AND: [
            paymentWhere,
            EXCLUDE_BULK_UMBRELLA_WHERE,
            {
              OR: [
                { status: "PAID", paidAt: { gte: yearStart } },
                { status: "PENDING" },
              ],
            },
          ],
        },
        select: {
          amount: true,
          expectedAmount: true,
          status: true,
          paidAt: true,
          createdAt: true,
          parentPaymentId: true,
          session: { select: { startTime: true } },
          _count: { select: { childPayments: true } },
        },
      }),
      prisma.client.findMany({
        where: { AND: [clientWhere, { createdAt: { gte: yearStart } }] },
        select: { createdAt: true },
      }),
      prisma.client.count({ where: clientWhere }),
      prisma.client.groupBy({ by: ["status"], where: clientWhere, _count: true }),
      prisma.client.count({
        where: {
          AND: [
            clientWhere,
            {
              status: { not: "ARCHIVED" },
              therapySessions: { some: { startTime: { gte: threeMonthsAgo }, status: "COMPLETED" } },
            },
          ],
        },
      }),
      prisma.client.count({ where: { AND: [clientWhere, { status: { not: "ARCHIVED" } }] } }),
    ]);

    // Monthly breakdown — בשעון ישראל
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      // i הוא 0-11; חודש בישראל = i+1 (1-12)
      const monthNum = i + 1;
      const monthStr = String(monthNum).padStart(2, "0");
      const monthStart = parseIsraelTime(`${israelYear}-${monthStr}-01`);
      // סוף חודש = 1 של החודש הבא פחות מילישנייה
      const nextMonth = monthNum === 12
        ? parseIsraelTime(`${israelYear + 1}-01-01`)
        : parseIsraelTime(`${israelYear}-${String(monthNum + 1).padStart(2, "0")}-01`);
      const monthEnd = new Date(nextMonth.getTime() - 1);
      const msStart = monthStart.getTime();
      const msEnd = monthEnd.getTime();

      const monthSessions = allSessions.filter(s => {
        const t = s.startTime.getTime();
        return t >= msStart && t <= msEnd;
      });
      const completed = monthSessions.filter(s => s.status === "COMPLETED").length;
      const cancelled = monthSessions.filter(s => s.status === "CANCELLED").length;
      const total = monthSessions.length;

      // ספירת תשלומים אמיתיים בלבד: ילדים (חלקיים) + הורים ללא ילדים (מלאים)
      // מונע כפילות: הורה עם ילדים לא נספר כי הילדים כבר נספרים
      const paidAmount = allPayments
        .filter(p =>
          p.status === "PAID" && p.paidAt && p.paidAt.getTime() >= msStart && p.paidAt.getTime() <= msEnd &&
          (p.parentPaymentId !== null || p._count.childPayments === 0)
        )
        .reduce((sum, p) => sum + Number(p.amount), 0);

      // accrual: ההכנסה משויכת לחודש שבו ניתן השירות (מועד הפגישה).
      // אם התשלום לא קשור לפגישה (חבילה/תשלום ידני) — fallback ל-paidAt
      // כדי לא לאבד אותו.
      const accrualAmount = allPayments
        .filter(p =>
          p.status === "PAID" && p.paidAt &&
          (p.parentPaymentId !== null || p._count.childPayments === 0)
        )
        .filter(p => {
          const refDate = p.session?.startTime ?? p.paidAt;
          if (!refDate) return false;
          const t = refDate.getTime();
          return t >= msStart && t <= msEnd;
        })
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const pendingAmount = allPayments
        .filter(p => p.status === "PENDING" && p.createdAt.getTime() >= msStart && p.createdAt.getTime() <= msEnd)
        .reduce((sum, p) => sum + (Number(p.expectedAmount) || Number(p.amount)) - Number(p.amount), 0);

      const newClients = allNewClients.filter(c => {
        const t = c.createdAt.getTime();
        return t >= msStart && t <= msEnd;
      }).length;

      const totalPayments = paidAmount + pendingAmount;

      return {
        month: monthStart.toLocaleString("he-IL", { month: "short", timeZone: "Asia/Jerusalem" }),
        sessions: completed,
        income: paidAmount,
        incomeAccrual: accrualAmount,
        newClients,
        cancelledSessions: cancelled,
        cancellationRate: total > 0 ? Math.round((cancelled / total) * 100) : 0,
        collectionRate: totalPayments > 0 ? Math.round((paidAmount / totalPayments) * 100) : 0,
      };
    });

    // Yearly totals
    const completedTotal = allSessions.filter(s => s.status === "COMPLETED").length;
    const cancelledTotal = allSessions.filter(s => s.status === "CANCELLED").length;
    const totalSessionsAll = allSessions.length;
    const paidTotal = allPayments.filter(p => p.status === "PAID" && (p.parentPaymentId !== null || p._count.childPayments === 0)).reduce((sum, p) => sum + Number(p.amount), 0);
    const pendingTotal = allPayments.filter(p => p.status === "PENDING").reduce((sum, p) => sum + (Number(p.expectedAmount) || Number(p.amount)) - Number(p.amount), 0);
    const allPaymentsTotal = paidTotal + pendingTotal;

    // Day of week distribution
    const dayCount = [0, 0, 0, 0, 0, 0, 0];
    allSessions.filter(s => s.status === "COMPLETED").forEach(s => {
      dayCount[s.startTime.getDay()]++;
    });
    const dayDistribution = hebrewDays.map((day, i) => ({ day, count: dayCount[i] }));
    const busiestDayIndex = dayCount.indexOf(Math.max(...dayCount));

    // Session type distribution
    const typeMap: Record<string, string> = { ONLINE: "אונליין", PHONE: "טלפון", FRONTAL: "פרונטלי" };
    const sessionTypeCount: Record<string, number> = {};
    allSessions.forEach(s => {
      const typeName = typeMap[s.type] || s.type;
      sessionTypeCount[typeName] = (sessionTypeCount[typeName] || 0) + 1;
    });
    const sessionTypes = Object.entries(sessionTypeCount).map(([type, count]) => ({ type, count }));

    // Client status distribution
    const clientStatus = clientStatusData.map(c => ({
      status: c.status === "ACTIVE" ? "פעילים" : c.status === "WAITING" ? "ממתינים" : "ארכיון",
      count: c._count,
    }));

    // Retention rate
    const retentionRate = totalNonArchived > 0 ? Math.round((activeWithRecent / totalNonArchived) * 100) : 0;

    return {
      monthlyData,
      totals: {
        clients: totalClients,
        sessions: completedTotal,
        income: paidTotal,
        cancellationRate: totalSessionsAll > 0 ? Math.round((cancelledTotal / totalSessionsAll) * 100) : 0,
        collectionRate: allPaymentsTotal > 0 ? Math.round((paidTotal / allPaymentsTotal) * 100) : 0,
        pendingAmount: pendingTotal,
        retentionRate,
        busiestDay: hebrewDays[busiestDayIndex] || "—",
        busiestDayCount: dayCount[busiestDayIndex] || 0,
      },
      sessionTypes,
      clientStatus,
      dayDistribution,
    };
  } catch (error) {
    console.error("Failed to get report data:", error);
    return {
      monthlyData: Array.from({ length: 12 }, (_, i) => ({
        month: new Date(new Date().getFullYear(), i, 1).toLocaleString("he-IL", { month: "short", timeZone: "Asia/Jerusalem" }),
        sessions: 0, income: 0, incomeAccrual: 0, newClients: 0,
        cancelledSessions: 0, cancellationRate: 0, collectionRate: 0,
      })),
      totals: {
        clients: 0, sessions: 0, income: 0,
        cancellationRate: 0, collectionRate: 0, pendingAmount: 0,
        retentionRate: 0, busiestDay: "—", busiestDayCount: 0,
      },
      sessionTypes: [],
      clientStatus: [],
      dayDistribution: [],
    };
  }
}

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const scopeUser = await loadScopeUser(session.user.id);

  // Phase 1 (סבב 21): canViewStats — היה dead permission עד היום (מוגדר במטריצה
  // אך לא נאכף בשום route). מזכירה בלי canViewStats לא תקבל גישה לדוחות
  // העסקיים. בעלים/מטפלים: גישה תמיד. הכלל לא חל על מטפל עצמאי (אין מזכירה).
  if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewStats")) {
    return (
      <div className="max-w-2xl mx-auto py-12" dir="rtl">
        <Card>
          <CardContent className="py-16 text-center space-y-4">
            <Lock className="h-12 w-12 text-muted-foreground mx-auto" aria-hidden="true" />
            <div>
              <h2 className="text-xl font-bold">אין הרשאה לצפייה בדוחות</h2>
              <p className="text-sm text-muted-foreground mt-2">
                גישה לדוחות העסקיים מותנית בהרשאת &quot;צפייה בסטטיסטיקות&quot;.
                <br />
                לפתיחת ההרשאה — פנה/י לבעל/ת הקליניקה.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/dashboard">חזרה לדשבורד</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = await getReportData(scopeUser);

  return <ReportsView data={data} />;
}
