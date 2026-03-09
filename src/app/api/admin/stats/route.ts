import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const TIER_FALLBACK_PRICES: Record<string, number> = {
  ESSENTIAL: 117,
  PRO: 145,
  ENTERPRISE: 220,
};

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "לא מורשה" }, { status: 403 });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalUsers,
      activeUsers,
      newUsersThisMonth,
      totalApiCalls,
      apiCallsToday,
      paidPayments,
      pendingPayments,
      documentsCount,
      recordingsCount,
      tierLimits,
      activePayingByTier,
      cancelledCount,
      pausedCount,
      totalNonTrialing,
      trialingUsers,
      activeSubscribers,
      activeNonFreeSubscribers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isBlocked: false } }),
      prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.apiUsageLog.count(),
      prisma.apiUsageLog.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.subscriptionPayment.aggregate({
        where: { status: "PAID" },
        _sum: { amount: true },
      }),
      prisma.subscriptionPayment.count({ where: { status: "PENDING" } }),
      prisma.document.count(),
      prisma.recording.count(),
      prisma.tierLimits.findMany(),
      prisma.user.groupBy({
        by: ["aiTier"],
        where: {
          subscriptionStatus: "ACTIVE",
          isFreeSubscription: false,
          isBlocked: false,
        },
        _count: true,
      }),
      prisma.user.count({ where: { subscriptionStatus: "CANCELLED" } }),
      prisma.user.count({ where: { subscriptionStatus: "PAUSED" } }),
      prisma.user.count({ where: { subscriptionStatus: { not: "TRIALING" } } }),
      prisma.user.count({ where: { subscriptionStatus: "TRIALING" } }),
      prisma.user.count({ where: { subscriptionStatus: "ACTIVE" } }),
      prisma.user.count({
        where: {
          subscriptionStatus: "ACTIVE",
          isFreeSubscription: false,
        },
      }),
    ]);

    const tierPriceMap: Record<string, number> = {};
    for (const tl of tierLimits) {
      tierPriceMap[tl.tier] = tl.priceMonthly;
    }

    let mrr = 0;
    for (const group of activePayingByTier) {
      const price = tierPriceMap[group.aiTier] ?? TIER_FALLBACK_PRICES[group.aiTier] ?? 0;
      mrr += price * group._count;
    }
    const arr = mrr * 12;

    const churnedUsers = cancelledCount + pausedCount;
    const churnRate = totalNonTrialing > 0
      ? Math.round((churnedUsers / totalNonTrialing) * 10000) / 100
      : 0;

    const estimatedDocumentStorageGB = (documentsCount * 5) / 1024;
    const estimatedRecordingStorageGB = (recordingsCount * 10) / 1024;
    const totalStorageGB = estimatedDocumentStorageGB + estimatedRecordingStorageGB;

    return NextResponse.json({
      totalUsers,
      activeUsers,
      newUsersThisMonth,
      totalApiCalls,
      apiCallsToday,
      totalRevenue: Number(paidPayments._sum.amount) || 0,
      pendingPayments,
      totalStorageGB,
      averageStoragePerUser: totalUsers > 0 ? totalStorageGB / totalUsers : 0,
      mrr,
      arr,
      churnRate,
      churnedUsers,
      totalNonTrialing,
      funnel: {
        totalSignups: totalUsers,
        activeTrials: trialingUsers,
        convertedToPaid: activeNonFreeSubscribers,
        currentlyActive: activeSubscribers,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הסטטיסטיקות" },
      { status: 500 }
    );
  }
}
