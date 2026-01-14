import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "לא מורשה" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const userId = searchParams.get("userId");
    const endpoint = searchParams.get("endpoint");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (endpoint) where.endpoint = { contains: endpoint };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, Date>).gte = new Date(startDate);
      if (endDate) (where.createdAt as Record<string, Date>).lte = new Date(endDate);
    }

    const [logs, total, stats] = await Promise.all([
      prisma.apiUsageLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.apiUsageLog.count({ where }),
      prisma.apiUsageLog.aggregate({
        where,
        _sum: {
          tokensUsed: true,
          cost: true,
        },
        _avg: {
          durationMs: true,
        },
      }),
    ]);

    // Get usage by endpoint
    const usageByEndpoint = await prisma.apiUsageLog.groupBy({
      by: ["endpoint"],
      where,
      _count: true,
      _sum: {
        tokensUsed: true,
        cost: true,
      },
    });

    // Get usage by user
    const usageByUser = await prisma.apiUsageLog.groupBy({
      by: ["userId"],
      where,
      _count: {
        userId: true,
      },
      _sum: {
        tokensUsed: true,
        cost: true,
      },
      orderBy: {
        _count: {
          userId: "desc",
        },
      },
      take: 10,
    });

    // Fetch user names for the top users
    const userIds = usageByUser.map((u) => u.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });

    const usageByUserWithNames = usageByUser.map((u) => {
      const user = users.find((usr) => usr.id === u.userId);
      return {
        userId: u.userId,
        _count: u._count.userId,
        _sum: u._sum,
        user,
      };
    });

    // Transform usageByEndpoint to have _count as number
    const usageByEndpointFormatted = usageByEndpoint.map((item) => ({
      endpoint: item.endpoint,
      _count: typeof item._count === 'object' ? (item._count as { _all?: number })._all || 0 : item._count,
      _sum: item._sum,
    }));

    return NextResponse.json({
      logs,
      total,
      stats: {
        totalTokens: stats._sum.tokensUsed || 0,
        totalCost: Number(stats._sum.cost) || 0,
        avgDuration: stats._avg.durationMs || 0,
      },
      usageByEndpoint: usageByEndpointFormatted,
      usageByUser: usageByUserWithNames,
    });
  } catch (error) {
    console.error("Get API usage error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת נתוני השימוש" },
      { status: 500 }
    );
  }
}
