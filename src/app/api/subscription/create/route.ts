// src/app/api/subscription/create/route.ts
// API ליצירת מנוי חדש - תומך ב-4 תקופות: חודשי, רבעוני, חצי-שנתי, שנתי
// כל המנויים מתחדשים אוטומטית עד שהמנוי מבטל.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { MeshulamClient } from "@/lib/meshulam";
import { checkRateLimit, SUBSCRIPTION_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { PRICING, PERIOD_DAYS, PERIOD_LABELS } from "@/lib/pricing";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    // Rate limiting - 5 ניסיונות יצירת מנוי לשעה
    const rateCheck = checkRateLimit(`sub_create:${session.user.id}`, SUBSCRIPTION_RATE_LIMIT);
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck);
    }

    const { plan, billingMonths = 1, termsAccepted } = await request.json();

    // בדיקת אישור תנאים - חובה לפני רכישה
    if (!termsAccepted) {
      return NextResponse.json(
        { error: "יש לאשר את תנאי השימוש לפני רכישת מנוי" },
        { status: 400 }
      );
    }

    // בדיקות תקינות
    if (!plan || !PRICING[plan]) {
      return NextResponse.json({ error: "מסלול לא תקין" }, { status: 400 });
    }

    const months = Number(billingMonths);
    if (![1, 3, 6, 12].includes(months)) {
      return NextResponse.json({ error: "תקופת חיוב לא תקינה" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });
    }

    const meshulamApiKey = process.env.MESHULAM_API_KEY;
    if (!meshulamApiKey) {
      return NextResponse.json(
        { error: "מערכת התשלומים לא מוגדרת" },
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
      console.error("Meshulam subscription creation failed:", response);
      return NextResponse.json(
        { error: response.message || "שגיאה ביצירת הרשמה" },
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
    console.error("Subscription creation error:", error);
    return NextResponse.json(
      { error: "שגיאה ביצירת מנוי" },
      { status: 500 }
    );
  }
}
