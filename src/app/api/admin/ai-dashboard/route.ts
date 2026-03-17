import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAdmin } from "@/lib/api-auth";

/**
 * GET /api/admin/ai-dashboard
 * Get all users with AI usage stats for admin dashboard
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

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
    logger.error("Error fetching admin AI dashboard:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
