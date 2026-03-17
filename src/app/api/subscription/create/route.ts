// src/app/api/subscription/create/route.ts
// API ליצירת מנוי חדש - תומך ב-4 תקופות: חודשי, רבעוני, חצי-שנתי, שנתי
// כל המנויים מתחדשים אוטומטית עד שהמנוי מבטל.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { MeshulamClient } from "@/lib/meshulam";
import { checkRateLimit, SUBSCRIPTION_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { PRICING, PERIOD_DAYS, PERIOD_LABELS } from "@/lib/pricing";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    // Rate limiting - 5 ניסיונות יצירת מנוי לשעה
    const rateCheck = checkRateLimit(`sub_create:${userId}`, SUBSCRIPTION_RATE_LIMIT);
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck);
    }

    const { plan, billingMonths = 1, termsAccepted } = await request.json();

    // בדיקת אישור תנאים - חובה לפני רכישה
    if (!termsAccepted) {
      return NextResponse.json(
        { message: "יש לאשר את תנאי השימוש לפני רכישת מנוי" },
        { status: 400 }
      );
    }

    // בדיקות תקינות
    if (!plan || !PRICING[plan]) {
      return NextResponse.json({ message: "מסלול לא תקין" }, { status: 400 });
    }

    const months = Number(billingMonths);
    if (![1, 3, 6, 12].includes(months)) {
      return NextResponse.json({ message: "תקופת חיוב לא תקינה" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    const meshulamApiKey = process.env.MESHULAM_API_KEY;
    if (!meshulamApiKey) {
      return NextResponse.json(
        { message: "מערכת התשלומים לא מוגדרת" },
        { status: 500 }
      );
    }

    const amount = PRICING[plan][months];
    const intervalDays = PERIOD_DAYS[months];
    const description = `מנוי ${plan} ${PERIOD_LABELS[months]} - Tipul`;
    const client = new MeshulamClient(meshulamApiKey);

    // כל המנויים הם הוראת קבע שמתחדשת אוטומטית
    const response = await client.createSubscription({
      customer: {
        customerName: user.name || "משתמש",
        customerEmail: user.email || undefined,
        customerPhone: user.phone || undefined,
      },
      amount,
      description,
      intervalDays,
      successUrl: `${process.env.NEXTAUTH_URL}/dashboard?subscription=success&months=${months}`,
      webhookUrl: `${process.env.NEXTAUTH_URL}/api/webhooks/meshulam`,
    });

    if (response.status !== 1 || !response.data) {
      logger.error("Meshulam subscription creation failed:", { error: String(response) });
      return NextResponse.json(
        { message: response.message || "שגיאה ביצירת הרשמה" },
        { status: 500 }
      );
    }

    // עדכון המשתמש
    await prisma.user.update({
      where: { id: user.id },
      data: {
        aiTier: plan as "ESSENTIAL" | "PRO" | "ENTERPRISE",
        subscriptionStatus: "TRIALING", // יעודכן ל-ACTIVE אחרי תשלום מוצלח
      },
    });

    // שמירת הוכחה חוקית על אישור תנאים
    await prisma.termsAcceptance.create({
      data: {
        userId: user.id,
        userEmail: user.email || "",
        userName: user.name,
        termsVersion: "1.0",
        termsType: "SUBSCRIPTION_TERMS",
        acceptedContent: `המשתמש אישר את תנאי המנוי כולל: חידוש אוטומטי, מדיניות ביטול והתאמת הנחה, ותנאי שימוש כלליים.`,
        action: "SUBSCRIPTION_CREATE",
        planSelected: plan,
        billingMonths: months,
        amountAgreed: amount,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json({
      success: true,
      paymentUrl: response.data.paymentUrl,
      plan,
      amount,
      billingMonths: months,
      intervalDays,
    });
  } catch (error) {
    logger.error("Subscription creation error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת מנוי" },
      { status: 500 }
    );
  }
}
