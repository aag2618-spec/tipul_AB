import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

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
        where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
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
          createdAt: { gte: new Date(now.getFullYear(), 0, 1) },
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

    const monthNames = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
    const prices: Record<string, number> = { ESSENTIAL: 117, PRO: 145, ENTERPRISE: 220 };
    const monthlyTrend: { month: string; users: number; revenue: number }[] = [];
    for (let m = 0; m <= now.getMonth(); m++) {
      const usersInMonth = monthlyUsers.filter((u) => new Date(u.createdAt).getMonth() <= m).length;
      const revenue = monthlyUsers
        .filter((u) => new Date(u.createdAt).getMonth() <= m)
        .reduce((sum, u) => sum + (prices[u.aiTier] || 117), 0);
      monthlyTrend.push({ month: monthNames[m], users: usersInMonth, revenue });
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
    console.error("Error fetching AI stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
