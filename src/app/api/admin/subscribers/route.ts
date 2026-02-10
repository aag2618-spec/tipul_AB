// src/app/api/admin/subscribers/route.ts
// API חיפוש מנויים - חיפוש לפי שם (חלקי), מייל, סטטוס
// מחזיר את כל המידע הרלוונטי: פרטים, מנוי, תשלומים, אישורי תנאים

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "לא מורשה" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status"); // ACTIVE, CANCELLED, etc.
    const tier = searchParams.get("tier"); // ESSENTIAL, PRO, ENTERPRISE
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // בניית query לחיפוש
    const where: Record<string, unknown> = {};
    
    // חיפוש לפי שם או מייל - חיפוש חלקי
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    if (status) {
      where.subscriptionStatus = status;
    }

    if (tier) {
      where.aiTier = tier;
    }

    // שליפת מנויים עם כל המידע
    const [subscribers, total, statsData] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          aiTier: true,
          subscriptionStatus: true,
          subscriptionStartedAt: true,
          subscriptionEndsAt: true,
          trialEndsAt: true,
          isBlocked: true,
          isFreeSubscription: true,
          freeSubscriptionNote: true,
          freeSubscriptionGrantedAt: true,
          createdAt: true,
          // תשלומים אחרונים
          subscriptionPayments: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              amount: true,
              status: true,
              description: true,
              paidAt: true,
              createdAt: true,
            },
          },
          // אישורי תנאים
          termsAcceptances: {
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              termsVersion: true,
              action: true,
              planSelected: true,
              amountAgreed: true,
              ipAddress: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
      // סטטיסטיקות כלליות
      Promise.all([
        prisma.user.count({ where: { subscriptionStatus: "ACTIVE" } }),
        prisma.user.count({ where: { subscriptionStatus: "CANCELLED" } }),
        prisma.user.count({ where: { subscriptionStatus: "TRIALING" } }),
        prisma.user.count({ where: { subscriptionStatus: "PAST_DUE" } }),
        prisma.user.count({ where: { isBlocked: true } }),
        prisma.user.count(),
      ]),
    ]);

    const [activeCount, cancelledCount, trialingCount, pastDueCount, blockedCount, totalUsers] = statsData;

    return NextResponse.json({
      subscribers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: totalUsers,
        active: activeCount,
        cancelled: cancelledCount,
        trialing: trialingCount,
        pastDue: pastDueCount,
        blocked: blockedCount,
      },
    });
  } catch (error) {
    console.error("Subscribers search error:", error);
    return NextResponse.json(
      { error: "שגיאה בחיפוש מנויים" },
      { status: 500 }
    );
  }
}
