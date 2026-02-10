// src/app/api/subscription/status/route.ts
// API לקבלת סטטוס המנוי של המשתמש

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { MONTHLY_PRICES } from "@/lib/pricing";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        aiTier: true,
        subscriptionStatus: true,
        subscriptionStartedAt: true,
        subscriptionEndsAt: true,
        trialEndsAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });
    }

    // בדיקה אם המנוי בתוקף
    // כולל: ACTIVE, TRIALING בתוקף, CANCELLED אבל עדיין בתוך התקופה ששילם
    const now = new Date();
    const isActive = 
      user.subscriptionStatus === "ACTIVE" ||
      (user.subscriptionStatus === "TRIALING" && user.trialEndsAt && user.trialEndsAt > now) ||
      (user.subscriptionStatus === "CANCELLED" && user.subscriptionEndsAt && user.subscriptionEndsAt > now);

    // קבלת תשלומים אחרונים
    const recentPayments = await prisma.subscriptionPayment.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        amount: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        paidAt: true,
        invoiceUrl: true,
      },
    });

    return NextResponse.json({
      plan: user.aiTier,
      status: user.subscriptionStatus,
      isActive,
      subscriptionStartedAt: user.subscriptionStartedAt,
      subscriptionEndsAt: user.subscriptionEndsAt,
      trialEndsAt: user.trialEndsAt,
      monthlyPrice: MONTHLY_PRICES[user.aiTier] || 0,
      recentPayments,
    });
  } catch (error) {
    console.error("Subscription status error:", error);
    return NextResponse.json(
      { error: "שגיאה בקבלת סטטוס מנוי" },
      { status: 500 }
    );
  }
}
