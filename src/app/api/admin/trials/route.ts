// src/app/api/admin/trials/route.ts
// Admin API: ניהול משתמשי ניסיון

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "לא מורשה" }, { status: 403 });
    }

    const search = req.nextUrl.searchParams.get("search") || "";
    const status = req.nextUrl.searchParams.get("status") || "all"; // all, active, expired, converted

    // Base filter: users who have/had a trial
    const where: Record<string, unknown> = {
      trialEndsAt: { not: null },
    };

    // Filter by status
    if (status === "active") {
      where.subscriptionStatus = "TRIALING";
    } else if (status === "expired") {
      where.subscriptionStatus = { in: ["PAST_DUE", "CANCELLED"] };
      where.isFreeSubscription = false;
    } else if (status === "converted") {
      where.subscriptionStatus = "ACTIVE";
      where.subscriptionStartedAt = { not: null };
    }

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    const trialUsers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        aiTier: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        emailVerified: true,
        isBlocked: true,
        isFreeSubscription: true,
        trialAiUsedCost: true,
        trialAiCostLimit: true,
        createdAt: true,
        subscriptionStartedAt: true,
        aiUsageStats: {
          select: {
            totalCalls: true,
            totalCost: true,
            currentMonthCalls: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Stats
    const now = new Date();
    const stats = {
      total: trialUsers.length,
      active: trialUsers.filter(u => u.subscriptionStatus === "TRIALING" && u.trialEndsAt && new Date(u.trialEndsAt) > now).length,
      expired: trialUsers.filter(u => u.subscriptionStatus !== "TRIALING" && u.subscriptionStatus !== "ACTIVE").length,
      converted: trialUsers.filter(u => u.subscriptionStatus === "ACTIVE" && u.subscriptionStartedAt).length,
      blocked: trialUsers.filter(u => u.isBlocked).length,
      unverified: trialUsers.filter(u => !u.emailVerified).length,
    };

    return NextResponse.json({ users: trialUsers, stats });
  } catch (error) {
    console.error("Admin trials API error:", error);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

// PATCH: block/unblock trial user or convert to free subscription
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "לא מורשה" }, { status: 403 });
    }

    const body = await req.json();
    const { userId, action, aiTier, note } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: "חסר userId או action" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, subscriptionStatus: true },
    });

    if (!user) {
      return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });
    }

    switch (action) {
      case "block": {
        await prisma.user.update({
          where: { id: userId },
          data: { isBlocked: true },
        });
        return NextResponse.json({ success: true, message: `${user.name} נחסם` });
      }

      case "unblock": {
        await prisma.user.update({
          where: { id: userId },
          data: { isBlocked: false },
        });
        return NextResponse.json({ success: true, message: `${user.name} שוחרר מחסימה` });
      }

      case "grantFree": {
        // Convert trial user to free subscription on selected tier
        const tier = aiTier || "PRO";
        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionStatus: "ACTIVE",
            aiTier: tier,
            isFreeSubscription: true,
            freeSubscriptionNote: note || `הועבר מניסיון למנוי חינם ע"י מנהל`,
            freeSubscriptionGrantedAt: new Date(),
          },
        });
        return NextResponse.json({ 
          success: true, 
          message: `${user.name} הועבר למנוי חינם - ${tier}` 
        });
      }

      default:
        return NextResponse.json({ error: "פעולה לא מוכרת" }, { status: 400 });
    }
  } catch (error) {
    console.error("Admin trials PATCH error:", error);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
