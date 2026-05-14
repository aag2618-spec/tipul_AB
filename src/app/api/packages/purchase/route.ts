// src/app/api/packages/purchase/route.ts
// Stage 5 — קניית חבילת SMS/AI חד-פעמית דרך Cardcom.
//
// זרימה:
//   1. requireAuth + rate-limit
//   2. parseBody (zod) — { packageId }
//   3. שליפת Package מהקטלוג (חייב isActive=true)
//   4. resolvePackagePrice (USER → CLINIC_MEMBER → ORG → GLOBAL → fallback Package.priceIls)
//   5. validatePackagePurchase (isBlocked, isActive, priceIls)
//   6. יצירת CardcomTransaction(purpose=PACKAGE_PURCHASE, amount=price)
//   7. createPaymentPage (createToken=false — חד-פעמי) → URL
//
// ה-webhook ב-cardcom/admin (branch PACKAGE_PURCHASE) מטפל ביצירת UserPackagePurchase.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { getAdminCardcomClient } from "@/lib/cardcom/admin-config";
import { getAdminBusinessProfile } from "@/lib/site-settings";
import { scrubCardcomMessage } from "@/lib/cardcom/verify-webhook";
import { fetchAndResolvePackagePrice } from "@/lib/pricing/resolve";
import { validatePackagePurchase } from "@/lib/payments/package-purchase";
import {
  checkRateLimit,
  SUBSCRIPTION_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const purchaseSchema = z.object({
  packageId: z.string().min(1).max(64),
});

export async function POST(request: NextRequest) {
  try {
    // disallowImpersonation — רכישה אישית, OWNER לא יעשה זאת בשם target.
    const auth = await requireAuth({ disallowImpersonation: true });
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const rateCheck = checkRateLimit(
      `pkg_purchase:${userId}`,
      SUBSCRIPTION_RATE_LIMIT
    );
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck);

    const parsed = await parseBody(request, purchaseSchema);
    if ("error" in parsed) return parsed.error;
    const { packageId } = parsed.data;

    const [user, pkg] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          organizationId: true,
          isBlocked: true,
        },
      }),
      prisma.package.findUnique({
        where: { id: packageId },
        select: {
          id: true,
          type: true,
          name: true,
          credits: true,
          priceIls: true,
          isActive: true,
        },
      }),
    ]);
    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }
    if (!pkg) {
      return NextResponse.json({ message: "חבילה לא נמצאה" }, { status: 404 });
    }

    const now = new Date();
    const resolved = await fetchAndResolvePackagePrice({
      userId: user.id,
      organizationId: user.organizationId,
      packageType: pkg.type,
      credits: pkg.credits,
      now,
    });

    // policy gobers; אחרת נופל למחיר הקטלוג.
    const priceIls =
      resolved.priceIls !== null ? resolved.priceIls : Number(pkg.priceIls) || 0;

    const validation = validatePackagePurchase({
      isBlocked: user.isBlocked,
      packageIsActive: pkg.isActive,
      priceIls,
    });
    if (!validation.allowed) {
      return NextResponse.json({ message: validation.reason }, { status: 400 });
    }

    // === יצירת CardcomTransaction PENDING עם purpose=PACKAGE_PURCHASE ===
    // bulkPaymentIds משמש כשטח אחסון ל-packageId — ה-webhook קורא אותו כדי
    // לדעת איזו חבילה להעניק. שדה זה לא בשימוש ב-tenant=ADMIN לעסקאות רגילות
    // (הוא קיים ל-bulk payments ב-USER tenant), אז זה השימוש המנוגד.
    const cardcomTransaction = await prisma.cardcomTransaction.create({
      data: {
        tenant: "ADMIN",
        userId: user.id,
        purpose: "PACKAGE_PURCHASE",
        amount: priceIls,
        currency: "ILS",
        status: "PENDING",
        bulkPaymentIds: [pkg.id],
      },
    });

    // === קריאה ל-Cardcom — Operation=ChargeOnly (חד-פעמי, ללא token) ===
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.NEXTAUTH_URL ??
      "https://mytipul.co.il";

    let paymentPageResult;
    try {
      const adminClient = await getAdminCardcomClient();
      const businessProfile = await getAdminBusinessProfile();
      const documentType =
        businessProfile.type === "LICENSED"
          ? "TaxInvoiceAndReceipt"
          : "Receipt";
      const description = `${pkg.name} — MyTipul`;

      paymentPageResult = await adminClient.createPaymentPage({
        amount: priceIls,
        description,
        createToken: false, // חד-פעמי, לא צריך לחיוב חוזר
        returnValue: cardcomTransaction.id,
        uniqueAsmachta: cardcomTransaction.id,
        successRedirectUrl: `${baseUrl}/dashboard/settings/packages?purchase=success&pkg=${encodeURIComponent(pkg.id)}`,
        failedRedirectUrl: `${baseUrl}/dashboard/settings/packages?purchase=failed`,
        webhookUrl: `${baseUrl}/api/webhooks/cardcom/admin`,
        customer: {
          name: user.name || "משתמש",
          email: user.email || undefined,
        },
        documentType,
        products: [
          {
            description,
            unitCost: priceIls,
            quantity: 1,
          },
        ],
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
      logger.error("[packages/purchase] Cardcom createPaymentPage failed", {
        userId: user.id,
        packageId,
        transactionId: cardcomTransaction.id,
        error: scrubbedMsg,
      });
      return NextResponse.json(
        { message: "שגיאה ביצירת דף תשלום. נסה/י שוב מאוחר יותר." },
        { status: 502 }
      );
    }

    await prisma.cardcomTransaction.update({
      where: { id: cardcomTransaction.id },
      data: {
        lowProfileId: paymentPageResult.lowProfileId,
        paymentPageUrl: paymentPageResult.url,
      },
    });

    logger.info("[packages/purchase] payment page created", {
      userId: user.id,
      packageId,
      transactionId: cardcomTransaction.id,
      priceIls,
      priceSource: resolved.source,
    });

    return NextResponse.json({
      success: true,
      paymentUrl: paymentPageResult.url,
      lowProfileId: paymentPageResult.lowProfileId,
      transactionId: cardcomTransaction.id,
      priceIls,
    });
  } catch (error) {
    logger.error("[packages/purchase] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה ברכישת חבילה" },
      { status: 500 }
    );
  }
}
