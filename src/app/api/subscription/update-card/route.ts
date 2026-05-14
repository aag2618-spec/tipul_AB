// src/app/api/subscription/update-card/route.ts
// Stage 4 — דף ניהול מנוי. עדכון הכרטיס השמור לחיוב חוזר.
//
// זרימה (לפי peaceful-whistling-taco.md סעיף "שלב 4"):
//   1. requireAuth + rate-limit
//   2. validateCanUpdateCard (לא CANCELLED/PAUSED/billingPaidByClinic/isBlocked)
//   3. יצירת CardcomTransaction עם purpose=UPDATE_CARD, amount=0,
//      ללא subscriptionPaymentId (זה לא תשלום)
//   4. createPaymentPage עם createTokenOnly=true → Operation=CreateTokenOnly
//      → לא חיוב כסף, רק שמירת טוקן
//   5. עדכון transaction.lowProfileId
//   6. החזרת URL ל-iframe Cardcom
//
// ה-webhook ב-`/api/webhooks/cardcom/admin` (branch UPDATE_CARD) מטפל בכל השאר:
//   - יצירת SavedCardToken חדש (active)
//   - סימון ישנים כ-isActive=false
//   - חיבור כל ה-SPs הפעילים לטוקן החדש

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { getAdminCardcomClient } from "@/lib/cardcom/admin-config";
import { scrubCardcomMessage } from "@/lib/cardcom/verify-webhook";
import {
  checkRateLimit,
  SUBSCRIPTION_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { validateCanUpdateCard } from "@/lib/payments/subscription-settings";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // disallowImpersonation — שמירת כרטיס אישי; OWNER לא יעשה זאת בשם target.
    const auth = await requireAuth({ disallowImpersonation: true });
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const rateCheck = checkRateLimit(
      `sub_update_card:${userId}`,
      SUBSCRIPTION_RATE_LIMIT
    );
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        subscriptionStatus: true,
        billingPaidByClinic: true,
        isBlocked: true,
      },
    });
    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    const validation = validateCanUpdateCard({
      subscriptionStatus: user.subscriptionStatus,
      billingPaidByClinic: user.billingPaidByClinic,
      isBlocked: user.isBlocked,
    });
    if (!validation.allowed) {
      return NextResponse.json(
        { message: validation.reason },
        { status: 403 }
      );
    }

    // === יצירת CardcomTransaction PENDING עם purpose=UPDATE_CARD ===
    // אין subscriptionPaymentId כי זה לא תשלום, רק שמירת טוקן.
    const cardcomTransaction = await prisma.cardcomTransaction.create({
      data: {
        tenant: "ADMIN",
        userId: user.id,
        purpose: "UPDATE_CARD",
        amount: 0, // CreateTokenOnly — לא חיוב
        currency: "ILS",
        status: "PENDING",
      },
    });

    // === קריאה ל-Cardcom — Operation=CreateTokenOnly ===
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.NEXTAUTH_URL ??
      "https://mytipul.co.il";

    let paymentPageResult;
    try {
      const adminClient = await getAdminCardcomClient();
      paymentPageResult = await adminClient.createPaymentPage({
        // Cardcom LowProfile/Create דורש Amount > 0 גם ב-CreateTokenOnly
        // (סוכן 1 #1 — Cardcom דוחה Amount=0). שולחים Amount=1 והפעולה לא
        // מחייבת בפועל (Operation=CreateTokenOnly). ל-CardcomTransaction נשמר
        // amount=0 כדי לציין שזו לא עסקת חיוב אמיתית.
        amount: 1,
        description: "עדכון פרטי כרטיס אשראי - MyTipul",
        createTokenOnly: true, // ← קריטי: Operation=CreateTokenOnly
        returnValue: cardcomTransaction.id,
        uniqueAsmachta: cardcomTransaction.id,
        successRedirectUrl: `${baseUrl}/dashboard/settings/subscription?card=updated`,
        failedRedirectUrl: `${baseUrl}/dashboard/settings/subscription?card=failed`,
        webhookUrl: `${baseUrl}/api/webhooks/cardcom/admin`,
        customer: {
          name: user.name || "משתמש",
          email: user.email || undefined,
        },
        // documentType לא בשימוש ב-CreateTokenOnly אבל הפרמטר חובה ב-types.
        // ה-client מתעלם מ-Document כש-createTokenOnly=true.
        documentType: "Receipt",
        products: [],
        numOfPayments: 1,
      });

      if (!paymentPageResult?.url || !paymentPageResult?.lowProfileId) {
        throw new Error("Cardcom returned an empty payment URL");
      }
    } catch (cardcomError) {
      const rawMsg =
        cardcomError instanceof Error
          ? cardcomError.message
          : String(cardcomError);
      const scrubbedMsg = scrubCardcomMessage(rawMsg) ?? "unknown error";
      await prisma.cardcomTransaction.update({
        where: { id: cardcomTransaction.id },
        data: {
          status: "FAILED",
          errorMessage: scrubbedMsg.substring(0, 500),
        },
      });
      logger.error("[subscription/update-card] Cardcom createPaymentPage failed", {
        userId: user.id,
        transactionId: cardcomTransaction.id,
        error: scrubbedMsg,
      });
      return NextResponse.json(
        { message: "שגיאה ביצירת דף עדכון כרטיס. נסה/י שוב מאוחר יותר." },
        { status: 502 }
      );
    }

    // עדכון ה-transaction עם lowProfileId
    await prisma.cardcomTransaction.update({
      where: { id: cardcomTransaction.id },
      data: {
        lowProfileId: paymentPageResult.lowProfileId,
        paymentPageUrl: paymentPageResult.url,
      },
    });

    logger.info("[subscription/update-card] payment page created", {
      userId: user.id,
      transactionId: cardcomTransaction.id,
      lowProfileId: paymentPageResult.lowProfileId,
    });

    return NextResponse.json({
      success: true,
      paymentUrl: paymentPageResult.url,
      lowProfileId: paymentPageResult.lowProfileId,
      transactionId: cardcomTransaction.id,
    });
  } catch (error) {
    logger.error("[subscription/update-card] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בעדכון כרטיס" },
      { status: 500 }
    );
  }
}
