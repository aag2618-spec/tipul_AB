import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "לא מורשה" }, { status: 403 });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // User stats
    const [totalUsers, activeUsers, newUsersThisMonth] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isBlocked: false } }),
      prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    // API usage stats
    const [totalApiCalls, apiCallsToday] = await Promise.all([
      prisma.apiUsageLog.count(),
      prisma.apiUsageLog.count({ where: { createdAt: { gte: startOfDay } } }),
    ]);

    // Revenue stats
    const [paidPayments, pendingPayments] = await Promise.all([
      prisma.subscriptionPayment.aggregate({
        where: { status: "PAID" },
        _sum: { amount: true },
      }),
      prisma.subscriptionPayment.count({ where: { status: "PENDING" } }),
    ]);

    // Storage stats - count documents and recordings
    const [documentsCount, recordingsCount] = await Promise.all([
      prisma.document.count(),
      prisma.recording.count(),
    ]);

    // Estimate storage (rough estimate: avg 5MB per document, 10MB per recording)
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
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הסטטיסטיקות" },
      { status: 500 }
    );
  }
}
