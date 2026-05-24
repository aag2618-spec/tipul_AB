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
      select: { id: true, organizationId: true },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    const now = new Date();

    // Batch resolve — קריאה אחת ל-PricingPolicy + קריאה אחת ל-TierLimits
    // (במקום 6 קריאות נפרדות — 2 לכל tier).
    const resolvedMap = await fetchAndResolveSubscriptionPricesForTiers(
      {
        userId: user.id,
        organizationId: user.organizationId,
        now,
      },
      TIERS
    );

    const tiers = TIERS.map((tier) => {
      const resolved = resolvedMap.get(tier)!;
      return {
        tier,
        name: PLAN_NAMES[tier],
        priceMonthly: resolved.monthlyIls,
        pricing: {
          1: getPriceForPeriod(resolved, 1),
          3: getPriceForPeriod(resolved, 3),
          6: getPriceForPeriod(resolved, 6),
          12: getPriceForPeriod(resolved, 12),
        },
        // הערה: לא מחזירים את `source` ללקוח. זה מידע פנימי שעלול לדלוף
        // אינדיקציה אם יש PricingPolicy מותאם אישית למשתמש. ה-source נשמר
        // ב-server-side לdebug ב-logger במידת הצורך.
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
