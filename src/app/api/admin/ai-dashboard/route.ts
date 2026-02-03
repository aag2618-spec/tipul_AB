import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/ai-dashboard
 * Get all users with AI usage stats for admin dashboard
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all users with AI stats
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        aiTier: true,
        isBlocked: true,
        subscriptionStatus: true,
        createdAt: true,
        _count: {
          select: {
            clients: true,
            therapySessions: true,
          },
        },
        aiUsageStats: {
          select: {
            currentMonthCalls: true,
            currentMonthCost: true,
            totalCalls: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Transform data
    const usersData = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      aiTier: user.aiTier,
      isBlocked: user.isBlocked,
      subscriptionStatus: user.subscriptionStatus,
      createdAt: user.createdAt,
      _count: user._count,
      aiUsage: user.aiUsageStats || undefined,
    }));

    return NextResponse.json({
      success: true,
      users: usersData,
    });
  } catch (error) {
    console.error("Error fetching admin AI dashboard:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
