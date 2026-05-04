// src/app/api/subscription/status/route.ts
// API לקבלת סטטוס המנוי של המשתמש

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { MONTHLY_PRICES } from "@/lib/pricing";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        aiTier: true,
        subscriptionStatus: true,
        subscriptionStartedAt: true,
        subscriptionEndsAt: true,
        trialEndsAt: true,
        // MyTipul-B: שדות לתצוגת באנר "הקליניקה משלמת".
        billingPaidByClinic: true,
        subscriptionPausedReason: true,
        organization: { select: { name: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
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
      where: { userId: userId },
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
      // MyTipul-B: מאפשר ל-UI להציג באנר "הקליניקה משלמת" + לחסום קנייה אישית.
      billingPaidByClinic: user.billingPaidByClinic,
      subscriptionPausedReason: user.subscriptionPausedReason,
      clinicName: user.organization?.name ?? null,
    });
  } catch (error) {
    logger.error("Subscription status error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בקבלת סטטוס מנוי" },
      { status: 500 }
    );
  }
}
