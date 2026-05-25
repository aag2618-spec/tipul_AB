// src/app/api/subscription/tiers/route.ts
// API להחזרת רשימת מסלולי המנוי עם מחירים מותאמים אישית למשתמש המחובר.
//
// משתמש ב-resolver של תמחור כדי שהמחיר יותאם לפי הסדר:
//   USER → CLINIC_MEMBER → ORGANIZATION → GLOBAL policy → TierLimits (DB) → PRICING fallback
//
// משמש את:
//   - דף /dashboard/settings/billing (שדרוג/בחירת מסלול)
//   - דיאלוג סיכום תשלום

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import {
  fetchAndResolveSubscriptionPricesForTiers,
  getPriceForPeriod,
} from "@/lib/pricing/resolve";
import { PLAN_NAMES } from "@/lib/pricing";
import {
  checkRateLimit,
  API_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";
import type { AITier } from "@prisma/client";
import {
  getActivePromotionForUser,
  applyPromotionDiscount,
} from "@/lib/promotions";

export const dynamic = "force-dynamic";

const TIERS: AITier[] = ["ESSENTIAL", "PRO", "ENTERPRISE"];

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    // Rate limit: 100/דקה למשתמש. מגן מפני ספאם בקריאות (כל קריאה = 2 שאילתות DB).
    const rateCheck = checkRateLimit(`sub_tiers:${userId}`, API_RATE_LIMIT);
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        organizationId: true,
        subscriptionStatus: true,
      },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    const now = new Date();
    const hasActive = user.subscriptionStatus === "ACTIVE" || user.subscriptionStatus === "TRIALING";

    const [resolvedMap, promotion] = await Promise.all([
      fetchAndResolveSubscriptionPricesForTiers(
        { userId: user.id, organizationId: user.organizationId, now },
        TIERS
      ),
      getActivePromotionForUser(userId, hasActive),
    ]);

    const disc = promotion?.discountPercent ?? 0;

    const tiers = TIERS.map((tier) => {
      const resolved = resolvedMap.get(tier)!;
      const p1 = getPriceForPeriod(resolved, 1);
      const p3 = getPriceForPeriod(resolved, 3);
      const p6 = getPriceForPeriod(resolved, 6);
      const p12 = getPriceForPeriod(resolved, 12);
      return {
        tier,
        name: PLAN_NAMES[tier],
        priceMonthly: disc > 0 ? applyPromotionDiscount(resolved.monthlyIls, disc) : resolved.monthlyIls,
        pricing: {
          1: disc > 0 ? applyPromotionDiscount(p1, disc) : p1,
          3: disc > 0 ? applyPromotionDiscount(p3, disc) : p3,
          6: disc > 0 ? applyPromotionDiscount(p6, disc) : p6,
          12: disc > 0 ? applyPromotionDiscount(p12, disc) : p12,
        },
      };
    });

    return NextResponse.json({ tiers });
  } catch (error) {
    logger.error("[subscription/tiers] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת מסלולי מנוי" },
      { status: 500 }
    );
  }
}
