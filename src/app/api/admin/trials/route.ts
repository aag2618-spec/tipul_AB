// src/app/api/admin/trials/route.ts
// Admin API: ניהול משתמשי ניסיון

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission, requireHighestPermission } from "@/lib/api-auth";
import type { Permission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("users.extend_trial_14d");
    if ("error" in auth) return auth.error;

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
        userNumber: true,
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
    logger.error("Admin trials API error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ message: "שגיאת שרת" }, { status: 500 });
  }
}

// PATCH: block/unblock trial user or convert to free subscription
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, action, aiTier, note } = body;

    if (!userId || !action) {
      return NextResponse.json({ message: "חסר userId או action" }, { status: 400 });
    }

    // Collect+max permission pattern — פר action
    const required: Permission[] = [];
    if (action === "block" || action === "unblock") required.push("users.block");
    if (action === "grantFree") required.push("users.grant_free_30d");
    if (required.length === 0) required.push("users.extend_trial_14d");

    const auth = await requireHighestPermission(required);
    if ("error" in auth) return auth.error;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, subscriptionStatus: true },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
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
        return NextResponse.json({ message: "פעולה לא מוכרת" }, { status: 400 });
    }
  } catch (error) {
    logger.error("Admin trials PATCH error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ message: "שגיאת שרת" }, { status: 500 });
  }
}
