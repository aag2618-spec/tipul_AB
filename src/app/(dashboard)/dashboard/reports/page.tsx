import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ReportsView, type ReportData } from "@/components/reports/reports-view";

const hebrewDays = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

async function getReportData(userId: string): Promise<ReportData> {
  try {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
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
        where: { therapistId: userId, startTime: { gte: yearStart }, type: { not: "BREAK" } },
        select: { startTime: true, status: true, type: true },
      }),
      prisma.payment.findMany({
        where: {
          client: { therapistId: userId },
          OR: [
            { status: "PAID", paidAt: { gte: yearStart } },
            { status: "PENDING" },
          ],
        },
        select: { amount: true, status: true, paidAt: true, createdAt: true },
      }),
      prisma.client.findMany({
        where: { therapistId: userId, createdAt: { gte: yearStart } },
        select: { createdAt: true },
      }),
      prisma.client.count({ where: { therapistId: userId } }),
      prisma.client.groupBy({ by: ["status"], where: { therapistId: userId }, _count: true }),
      prisma.client.count({
        where: {
          therapistId: userId,
          status: { not: "ARCHIVED" },
          therapySessions: { some: { startTime: { gte: threeMonthsAgo }, status: "COMPLETED" } },
        },
      }),
      prisma.client.count({ where: { therapistId: userId, status: { not: "ARCHIVED" } } }),
    ]);

    // Monthly breakdown
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const monthStart = new Date(now.getFullYear(), i, 1);
      const monthEnd = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59, 999);
      const msStart = monthStart.getTime();
      const msEnd = monthEnd.getTime();

      const monthSessions = allSessions.filter(s => {
        const t = s.startTime.getTime();
        return t >= msStart && t <= msEnd;
      });
      const completed = monthSessions.filter(s => s.status === "COMPLETED").length;
      const cancelled = monthSessions.filter(s => s.status === "CANCELLED").length;
      const total = monthSessions.length;

      const paidAmount = allPayments
        .filter(p => p.status === "PAID" && p.paidAt && p.paidAt.getTime() >= msStart && p.paidAt.getTime() <= msEnd)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const pendingAmount = allPayments
        .filter(p => p.status === "PENDING" && p.createdAt.getTime() >= msStart && p.createdAt.getTime() <= msEnd)
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const newClients = allNewClients.filter(c => {
        const t = c.createdAt.getTime();
        return t >= msStart && t <= msEnd;
      }).length;

      const totalPayments = paidAmount + pendingAmount;

      return {
        month: monthStart.toLocaleString("he-IL", { month: "short" }),
        sessions: completed,
        income: paidAmount,
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
    const paidTotal = allPayments.filter(p => p.status === "PAID").reduce((sum, p) => sum + Number(p.amount), 0);
    const pendingTotal = allPayments.filter(p => p.status === "PENDING").reduce((sum, p) => sum + Number(p.amount), 0);
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
        month: new Date(new Date().getFullYear(), i, 1).toLocaleString("he-IL", { month: "short" }),
        sessions: 0, income: 0, newClients: 0,
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

  const data = await getReportData(session.user.id);

  return <ReportsView data={data} />;
}
