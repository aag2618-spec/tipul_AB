import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getIsraelMidnight, getIsraelMonth, getIsraelYear, parseIsraelTime } from "@/lib/date-utils";

import { requirePermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("reports.view_ai");
    if ("error" in auth) return auth.error;

    // today / yesterday / startOfMonth / startOfYear — לפי שעון ישראל
    const now = new Date();
    const todayStart = getIsraelMidnight(now);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const israelMonth = getIsraelMonth(now);
    const israelYear = getIsraelYear(now);
    const startOfMonth = parseIsraelTime(
      `${israelYear}-${String(israelMonth).padStart(2, "0")}-01`
    );
    const startOfYear = parseIsraelTime(`${israelYear}-01-01`);

    const [
      totalUsers,
      tierCounts,
      todayLogs,
      yesterdayLogs,
      topUsersData,
      weeklyLogs,
      monthlyUsers,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "USER" } }),
      prisma.user.groupBy({
        by: ["aiTier"],
        where: { role: "USER" },
        _count: true,
      }),
      prisma.apiUsageLog.aggregate({
        where: { createdAt: { gte: todayStart } },
        _count: true,
        _sum: { cost: true },
      }),
      prisma.apiUsageLog.aggregate({
        where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
        _count: true,
        _sum: { cost: true },
      }),
      prisma.apiUsageLog.groupBy({
        by: ["userId"],
        where: { createdAt: { gte: startOfMonth } },
        _count: true,
        _sum: { cost: true },
        orderBy: { _count: { userId: "desc" } },
        take: 5,
      }),
      prisma.apiUsageLog.findMany({
        where: { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
        select: { createdAt: true, cost: true },
      }),
      prisma.user.findMany({
        where: {
          role: "USER",
          createdAt: { gte: startOfYear },
        },
        select: { createdAt: true, aiTier: true },
      }),
    ]);

    const topUserIds = topUsersData.map((u) => u.userId);
    const topUserNames = topUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: topUserIds } },
          select: { id: true, name: true, aiTier: true },
        })
      : [];

    const topUsers = topUsersData.map((u) => {
      const user = topUserNames.find((n) => n.id === u.userId);
      return {
        name: user?.name || "ללא שם",
        calls: u._count,
        tier: user?.aiTier || "ESSENTIAL",
      };
    });

    const tierDistribution = [
      { name: "Essential", value: tierCounts.find((t) => t.aiTier === "ESSENTIAL")?._count || 0, color: "#94a3b8" },
      { name: "Pro", value: tierCounts.find((t) => t.aiTier === "PRO")?._count || 0, color: "#3b82f6" },
      { name: "Enterprise", value: tierCounts.find((t) => t.aiTier === "ENTERPRISE")?._count || 0, color: "#8b5cf6" },
    ];

    const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
    const dayMap = new Map<number, { calls: number; cost: number }>();
    for (let i = 0; i < 7; i++) dayMap.set(i, { calls: 0, cost: 0 });
    for (const log of weeklyLogs) {
      const day = new Date(log.createdAt).getDay();
      const entry = dayMap.get(day)!;
      entry.calls += 1;
      entry.cost += Number(log.cost || 0);
    }
    const usageByDay = dayNames.map((name, i) => ({
      day: name,
      calls: dayMap.get(i)!.calls,
      cost: Math.round(dayMap.get(i)!.cost * 100) / 100,
    }));

    // monthlyTrend — חודשים 1..israelMonth (כולל), לפי שעון ישראל
    const monthNames = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
    const prices: Record<string, number> = { ESSENTIAL: 117, PRO: 145, ENTERPRISE: 220 };
    const monthlyTrend: { month: string; users: number; revenue: number }[] = [];
    for (let m = 1; m <= israelMonth; m++) {
      const usersInMonth = monthlyUsers.filter((u) => getIsraelMonth(new Date(u.createdAt)) <= m).length;
      const revenue = monthlyUsers
        .filter((u) => getIsraelMonth(new Date(u.createdAt)) <= m)
        .reduce((sum, u) => sum + (prices[u.aiTier] || 117), 0);
      monthlyTrend.push({ month: monthNames[m - 1], users: usersInMonth, revenue });
    }

    const todayCalls = todayLogs._count || 0;
    const yesterdayCalls = yesterdayLogs._count || 0;
    const todayCost = Number(todayLogs._sum?.cost || 0);
    const yesterdayCost = Number(yesterdayLogs._sum?.cost || 0);

    return NextResponse.json({
      summary: {
        todayCalls,
        todayCost: Math.round(todayCost * 100) / 100,
        callsChange: yesterdayCalls > 0 ? Math.round(((todayCalls - yesterdayCalls) / yesterdayCalls) * 100) : 0,
        costChange: yesterdayCost > 0 ? Math.round(((todayCost - yesterdayCost) / yesterdayCost) * 100) : 0,
        activeUsers: totalUsers,
        totalUsers,
      },
      tierDistribution,
      usageByDay,
      monthlyTrend,
      topUsers,
    });
  } catch (error) {
    logger.error("Error fetching AI stats:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ message: "שגיאה בטעינת סטטיסטיקות AI" }, { status: 500 });
  }
}
