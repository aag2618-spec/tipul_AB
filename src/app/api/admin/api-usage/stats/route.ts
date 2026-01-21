import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { format } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "לא מורשה" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const period = parseInt(searchParams.get("period") || "30");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);

    // Get all logs for the period
    const logs = await prisma.apiUsageLog.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Calculate stats
    const totalCalls = logs.length;
    const successfulCalls = logs.filter((l) => l.success).length;
    const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 100;
    const totalCost = logs.reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
    const avgDuration =
      logs.length > 0
        ? logs.reduce((sum, l) => sum + (l.durationMs || 0), 0) / logs.length
        : 0;

    // Group by endpoint
    const endpointCounts: Record<string, number> = {};
    logs.forEach((log) => {
      endpointCounts[log.endpoint] = (endpointCounts[log.endpoint] || 0) + 1;
    });
    const callsByEndpoint = Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count);

    // Group by day
    const dayCounts: Record<string, { count: number; cost: number }> = {};
    logs.forEach((log) => {
      const day = format(new Date(log.createdAt), "dd/MM");
      if (!dayCounts[day]) {
        dayCounts[day] = { count: 0, cost: 0 };
      }
      dayCounts[day].count++;
      dayCounts[day].cost += Number(log.cost) || 0;
    });
    const callsByDay = Object.entries(dayCounts)
      .map(([date, data]) => ({ date, ...data }))
      .reverse();

    // Group by user
    const userStats: Record<string, { name: string; count: number; cost: number }> = {};
    logs.forEach((log) => {
      const userId = log.userId;
      if (!userStats[userId]) {
        userStats[userId] = {
          name: log.user?.name || "Unknown",
          count: 0,
          cost: 0,
        };
      }
      userStats[userId].count++;
      userStats[userId].cost += Number(log.cost) || 0;
    });
    const topUsers = Object.entries(userStats)
      .map(([userId, data]) => ({ userId, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      totalCalls,
      totalCost,
      avgDuration,
      successRate,
      callsByEndpoint,
      callsByDay,
      topUsers,
    });
  } catch (error) {
    console.error("API usage stats error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הנתונים" },
      { status: 500 }
    );
  }
}

