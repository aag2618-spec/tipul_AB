// src/app/api/packages/route.ts
// GET — קטלוג חבילות SMS + יתרות + מכסת SMS חודשית, לצריכת דף החיוב (Client).
// קריאה בלבד (לא מבצע רכישה). הרכישה עצמה ב-/api/packages/purchase.
//
// משקף את לוגיקת הטעינה של עמוד /dashboard/settings/packages (Server Component)
// כדי שדף החיוב (Client) יוכל להציג מאזן ולרכוש בלי ניווט לעמוד נפרד.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { fetchAndResolvePackagePrice } from "@/lib/pricing/resolve";
import { buildPackagesView } from "@/lib/payments/package-purchase";

export const dynamic = "force-dynamic";

// חודש-שנה בלוח ישראלי (YYYY-MM). משמש להחלטה אם מכסת ה-SMS התאפסה.
function israelYearMonth(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

export async function GET() {
  try {
    // disallowImpersonation — היתרה שתוצג חייבת להיות זו שהרכישה תפעל עליה
    // (אותו userId כמו ב-/api/packages/purchase).
    const auth = await requireAuth({ disallowImpersonation: true });
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const [user, packages, purchases, commSetting] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, organizationId: true, isBlocked: true },
      }),
      // פיצ'ר ה-AI הוסר — מציגים לרכישה רק חבילות SMS.
      prisma.package.findMany({
        where: { isActive: true, type: "SMS" },
        orderBy: [{ type: "asc" }, { credits: "asc" }],
        select: {
          id: true,
          type: true,
          name: true,
          credits: true,
          priceIls: true,
          isActive: true,
        },
      }),
      prisma.userPackagePurchase.findMany({
        where: { userId, reverted: false },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { type: true, credits: true, creditsUsed: true, reverted: true },
      }),
      prisma.communicationSetting.findUnique({
        where: { userId },
        select: {
          smsMonthlyQuota: true,
          smsMonthlyUsage: true,
          smsQuotaResetDate: true,
        },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    // resolve מחירים מותאמים אישית פר חבילה (PricingPolicy), כמו בעמוד packages.
    const now = new Date();
    const resolvedPrices = new Map<string, number>();
    await Promise.all(
      packages.map(async (pkg) => {
        try {
          const r = await fetchAndResolvePackagePrice({
            userId: user.id,
            organizationId: user.organizationId,
            packageType: pkg.type,
            credits: pkg.credits,
            now,
          });
          if (r.priceIls !== null) resolvedPrices.set(pkg.id, r.priceIls);
        } catch (err) {
          logger.warn("[api/packages] price resolve failed (using catalog)", {
            packageId: pkg.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );

    const view = buildPackagesView({
      packages: packages.map((p) => ({
        id: p.id,
        type: p.type,
        name: p.name,
        credits: p.credits,
        priceIls: Number(p.priceIls) || 0,
        isActive: p.isActive,
      })),
      resolvedPrices,
      userPurchases: purchases,
    });

    // מכסת SMS חודשית (חינמית) — חישוב read-only עם איפוס לפי חודש ישראלי,
    // במקביל ללוגיקת checkAndUpdateQuota ב-sms.ts אך *ללא* כתיבה ל-DB.
    // ברירת המחדל 200 תואמת לסכימה ול-checkAndUpdateQuota (sms.ts) — כך משתמש
    // ללא רשומת CommunicationSetting יראה את המכסה האמיתית שיקבל בשליחה, לא 0.
    const quota = commSetting?.smsMonthlyQuota ?? 200;
    const storedUsage = commSetting?.smsMonthlyUsage ?? 0;
    const resetDate = commSetting?.smsQuotaResetDate ?? null;
    const sameMonth =
      resetDate !== null && israelYearMonth(resetDate) === israelYearMonth(now);
    const effectiveUsage = sameMonth ? storedUsage : 0;
    const monthlyRemaining = Math.max(0, quota - effectiveUsage);

    return NextResponse.json({
      packages: view.packages,
      balances: view.balances,
      isBlocked: user.isBlocked,
      monthlyQuota: quota,
      monthlyRemaining,
    });
  } catch (error) {
    logger.error("[api/packages] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת חבילות" },
      { status: 500 }
    );
  }
}
