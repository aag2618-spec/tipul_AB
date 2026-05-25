// ==================== Pricing Resolver ====================
// מוצא את המחיר הנכון למשתמש לפי סדר עדיפויות:
//   USER → CLINIC_MEMBER → ORGANIZATION → GLOBAL → TierLimits (DB) → fallback (pricing.ts hardcoded)
//
// העיצוב הוא pure-function שמקבל מערך של policies + context, ומחזיר מחיר.
// פעולות DB (Prisma query) נעטפו ב-`fetchAndResolveSubscriptionPrice`/`fetchAndResolvePackagePrice`
// — אלה מקבלים userId/orgId, שולפים את הפוליסיות, וקוראים לפונקציות ה-pure.
//
// **חשוב — שינוי קריטי (כסף):**
//   - resolve פעם אחת בעת יצירת מנוי (subscription/create) או חיוב חוזר (cron).
//   - לא לקרוא ב-render UI על כל page load (יוצר drift אם policy משתנה).

import type { AITier, PackageType, PricingScope, Prisma } from "@prisma/client";
import { MONTHLY_PRICES, PRICING } from "@/lib/pricing";

/**
 * נוסחת המרה ממחיר חודשי למחירי תקופות ארוכות.
 * אם discounts לא מועברים — משתמש בברירת מחדל (5%/10%/17%).
 *
 * הגנה כספית: זורק אם monthly <= 0 / NaN / Infinity — חיוב 0 ש"ח הוא באג קריטי.
 */
export function deriveMultiPeriodPrices(
  monthly: number,
  discounts?: { quarterly?: number; semiAnnual?: number; annual?: number }
): {
  quarterly: number;
  halfYear: number;
  yearly: number;
} {
  if (!Number.isFinite(monthly) || monthly <= 0) {
    throw new Error(
      `deriveMultiPeriodPrices: invalid monthly price ${String(monthly)} — must be a positive finite number`
    );
  }
  const dq = discounts?.quarterly ?? 5;
  const ds = discounts?.semiAnnual ?? 10;
  const da = discounts?.annual ?? 17;
  return {
    quarterly: Math.round(monthly * 3 * (1 - dq / 100)),
    halfYear: Math.round(monthly * 6 * (1 - ds / 100)),
    yearly: Math.round(monthly * 12 * (1 - da / 100)),
  };
}

// ============================================================================
// Types
// ============================================================================

/** רשומה ב-DB של PricingPolicy, מצומצמת לשדות שה-resolver צריך. */
export type ResolvableSubscriptionPolicy = {
  id: string;
  scope: PricingScope;
  organizationId: string | null;
  userId: string | null;
  planTier: AITier;
  monthlyIls: Prisma.Decimal | number;
  quarterlyIls: Prisma.Decimal | number | null;
  halfYearIls: Prisma.Decimal | number | null;
  yearlyIls: Prisma.Decimal | number | null;
  validFrom: Date;
  validUntil: Date | null;
};

export type ResolvablePackagePolicy = {
  id: string;
  scope: PricingScope;
  organizationId: string | null;
  userId: string | null;
  packageType: PackageType;
  credits: number;
  priceIls: Prisma.Decimal | number;
  validFrom: Date;
  validUntil: Date | null;
};

export type SubscriptionResolveContext = {
  userId: string;
  organizationId: string | null;
  planTier: AITier;
  now: Date;
};

export type PackageResolveContext = {
  userId: string;
  organizationId: string | null;
  packageType: PackageType;
  credits: number;
  now: Date;
};

/**
 * source מציין מאיפה הגיע המחיר:
 *  - PricingScope (USER/CLINIC_MEMBER/ORGANIZATION/GLOBAL) — מ-PricingPolicy table
 *  - "TIER_LIMITS" — מ-TierLimits table (UI ניהול ראשי, /admin/tier-settings)
 *  - "FALLBACK" — מ-PRICING hardcoded ב-pricing.ts (last resort)
 *
 * חשוב ל-observability ולדיבוג של drift בין מקורות תמחור.
 */
export type ResolvedSubscriptionPrice = {
  source: PricingScope | "TIER_LIMITS" | "FALLBACK";
  policyId: string | null;
  planTier: AITier;
  monthlyIls: number;
  quarterlyIls: number | null;
  halfYearIls: number | null;
  yearlyIls: number | null;
};

export type ResolvedPackagePrice = {
  source: PricingScope | "NONE";
  policyId: string | null;
  packageType: PackageType;
  credits: number;
  priceIls: number | null;
};

export type SubscriptionPeriodMonths = 1 | 3 | 6 | 12;

// ============================================================================
// Pure helpers
// ============================================================================

/**
 * המרת Prisma.Decimal | number | string ל-number טהור.
 * Prisma Decimal יכול לחזור כ-object עם toNumber(), כ-string (אחרי JSON.stringify),
 * או כ-number (אחרי deserialization). מטפלים בשלושת המקרים.
 */
function toNum(v: Prisma.Decimal | number | string | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  // Object עם toNumber (Prisma.Decimal)
  if (typeof v === "object" && "toNumber" in v && typeof v.toNumber === "function") {
    const n = v.toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toNumStrict(v: Prisma.Decimal | number | string): number {
  const n = toNum(v);
  if (n === null) {
    throw new Error(`Cannot convert pricing value to number: ${String(v)}`);
  }
  return n;
}

/**
 * האם policy פעיל בנקודת זמן.
 * boundary: validFrom <= now < validUntil (חצי-פתוח מימין)
 */
function isPolicyActive(
  p: { validFrom: Date; validUntil: Date | null },
  now: Date
): boolean {
  if (p.validFrom.getTime() > now.getTime()) return false;
  if (p.validUntil !== null && p.validUntil.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * מחזיר את ה-policy הפעיל הטרי ביותר (validFrom המאוחר) מתוך רשימה.
 * אם אין — null.
 *
 * Tie-breaker דטרמיניסטי: אם שני policies יש להם אותו validFrom, נבחר לפי id יציב.
 * זה מבטיח שאותה שאילתת DB תחזיר אותה תשובה כל פעם.
 */
export function pickActivePolicy<
  T extends { id: string; validFrom: Date; validUntil: Date | null }
>(policies: T[], now: Date): T | null {
  const active = policies.filter((p) => isPolicyActive(p, now));
  if (active.length === 0) return null;
  // Sort descending by validFrom; tie-breaker — id descending (יציב, דטרמיניסטי)
  active.sort((a, b) => {
    const diff = b.validFrom.getTime() - a.validFrom.getTime();
    if (diff !== 0) return diff;
    return b.id.localeCompare(a.id);
  });
  return active[0]!;
}

// ============================================================================
// Subscription resolve (pure)
// ============================================================================

const SCOPE_PRIORITY: PricingScope[] = ["USER", "CLINIC_MEMBER", "ORGANIZATION", "GLOBAL"];

/**
 * resolve מחיר מנוי לפי policies מועברות + context. Pure function.
 *
 * @param policies מערך policies שהוצא מ-DB (יכול להיות ריק).
 * @param ctx ה-context של המשתמש שעבורו מחפשים מחיר.
 * @returns מחיר עם source מציין מאיפה הגיע.
 */
export function resolveSubscriptionPriceFromPolicies(
  policies: ResolvableSubscriptionPolicy[],
  ctx: SubscriptionResolveContext
): ResolvedSubscriptionPrice {
  // סינון ראשון — רק policies רלוונטיים ל-planTier הזה
  const tierMatching = policies.filter((p) => p.planTier === ctx.planTier);

  for (const scope of SCOPE_PRIORITY) {
    const candidates = tierMatching.filter((p) => {
      if (p.scope !== scope) return false;
      switch (scope) {
        case "USER":
          return p.userId === ctx.userId;
        case "CLINIC_MEMBER":
          // CLINIC_MEMBER דורש גם userId וגם organizationId תואמים
          return (
            p.userId === ctx.userId &&
            ctx.organizationId !== null &&
            p.organizationId === ctx.organizationId
          );
        case "ORGANIZATION":
          return (
            ctx.organizationId !== null && p.organizationId === ctx.organizationId
          );
        case "GLOBAL":
          return true;
      }
    });

    const picked = pickActivePolicy(candidates, ctx.now);
    if (picked) {
      return {
        source: scope,
        policyId: picked.id,
        planTier: ctx.planTier,
        monthlyIls: toNumStrict(picked.monthlyIls),
        quarterlyIls: toNum(picked.quarterlyIls),
        halfYearIls: toNum(picked.halfYearIls),
        yearlyIls: toNum(picked.yearlyIls),
      };
    }
  }

  // Fallback ל-pricing.ts hardcoded
  const tierPricing = PRICING[ctx.planTier];
  const fallbackMonthly = tierPricing?.[1] ?? MONTHLY_PRICES[ctx.planTier];
  // הגנה כספית: לעולם לא להחזיר 0 שקט. אם אין מחיר ל-tier — חיוב 0 ש"ח הוא באג קריטי.
  if (fallbackMonthly === undefined || fallbackMonthly <= 0) {
    throw new Error(
      `No pricing found for tier ${ctx.planTier} — neither in policies nor in PRICING fallback. Cannot charge user.`
    );
  }
  return {
    source: "FALLBACK",
    policyId: null,
    planTier: ctx.planTier,
    monthlyIls: fallbackMonthly,
    quarterlyIls: tierPricing?.[3] ?? null,
    halfYearIls: tierPricing?.[6] ?? null,
    yearlyIls: tierPricing?.[12] ?? null,
  };
}

/**
 * fallback בטוח לתקופה: אם monthly תקין → נוסחת הנחה סטנדרטית (deriveMultiPeriodPrices),
 * אחרת ×N (התנהגות ישנה — לא לזרוק על monthly=0/NaN).
 *
 * **שינוי semantics (2026-05-24):** עד תאריך זה fallback היה monthly×N ללא הנחה,
 * מה שיצר drift עם TierLimits (שמשתמש בהנחה ×0.95/×0.9/×10). כעת הם עקביים — אם
 * PricingPolicy מכיל monthlyIls בלבד (תקופות null), הוא יקבל אותה הנחה אוטומטית.
 * אדמין שרוצה לבטל הנחה צריך למלא yearlyIls=monthlyIls×12 explicit.
 */
function safeDerivedPrice(monthly: number, months: 3 | 6 | 12): number {
  if (!Number.isFinite(monthly) || monthly <= 0) {
    // מחיר לא תקין — שומרים על fallback ×N הישן (לעולם לא לזרוק מתוך getPriceForPeriod)
    return monthly * months;
  }
  const derived = deriveMultiPeriodPrices(monthly);
  switch (months) {
    case 3:
      return derived.quarterly;
    case 6:
      return derived.halfYear;
    case 12:
      return derived.yearly;
  }
}

/**
 * מחיר לתקופה ספציפית. אם אין מחיר ספציפי לתקופה ב-policy, מחזיר fallback
 * עם הנחה סטנדרטית (×0.95 quarterly, ×0.9 halfYear, ×10 yearly) — עקבי עם
 * deriveMultiPeriodPrices ו-TierLimits flow.
 */
export function getPriceForPeriod(
  price: Pick<
    ResolvedSubscriptionPrice,
    "monthlyIls" | "quarterlyIls" | "halfYearIls" | "yearlyIls"
  >,
  months: SubscriptionPeriodMonths
): number {
  switch (months) {
    case 1:
      return price.monthlyIls;
    case 3:
      return price.quarterlyIls ?? safeDerivedPrice(price.monthlyIls, 3);
    case 6:
      return price.halfYearIls ?? safeDerivedPrice(price.monthlyIls, 6);
    case 12:
      return price.yearlyIls ?? safeDerivedPrice(price.monthlyIls, 12);
    default:
      throw new Error(`Invalid period months: ${months}`);
  }
}

// ============================================================================
// Package resolve (pure)
// ============================================================================

export function resolvePackagePriceFromPolicies(
  policies: ResolvablePackagePolicy[],
  ctx: PackageResolveContext
): ResolvedPackagePrice {
  // סינון ראשון — packageType + credits תואמים
  const matching = policies.filter(
    (p) => p.packageType === ctx.packageType && p.credits === ctx.credits
  );

  for (const scope of SCOPE_PRIORITY) {
    const candidates = matching.filter((p) => {
      if (p.scope !== scope) return false;
      switch (scope) {
        case "USER":
          return p.userId === ctx.userId;
        case "CLINIC_MEMBER":
          return (
            p.userId === ctx.userId &&
            ctx.organizationId !== null &&
            p.organizationId === ctx.organizationId
          );
        case "ORGANIZATION":
          return (
            ctx.organizationId !== null && p.organizationId === ctx.organizationId
          );
        case "GLOBAL":
          return true;
      }
    });

    const picked = pickActivePolicy(candidates, ctx.now);
    if (picked) {
      return {
        source: scope,
        policyId: picked.id,
        packageType: ctx.packageType,
        credits: ctx.credits,
        priceIls: toNumStrict(picked.priceIls),
      };
    }
  }

  // אין policy — אין fallback אוטומטי לחבילות (Package.priceIls יישלף חיצונית)
  return {
    source: "NONE",
    policyId: null,
    packageType: ctx.packageType,
    credits: ctx.credits,
    priceIls: null,
  };
}

// ============================================================================
// DB-aware wrappers
// ============================================================================

/**
 * שולף policies רלוונטיים מ-DB ומחזיר מחיר מנוי. מיועד לשימוש ב:
 *   - POST /api/subscription/create (יצירת מנוי חדש)
 *   - cron של חיוב חודשי (subscription-recurring-charge)
 *   - GET /api/subscription/tiers (תצוגת מחירים מותאמת אישית ב-UI)
 *
 * סדר עדיפויות:
 *   1. PricingPolicy עם scope=USER (משתמש ספציפי)
 *   2. PricingPolicy עם scope=CLINIC_MEMBER (משתמש בקליניקה)
 *   3. PricingPolicy עם scope=ORGANIZATION (קליניקה שלמה)
 *   4. PricingPolicy עם scope=GLOBAL
 *   5. TierLimits.priceMonthly מ-DB (נערך ב-/admin/tier-settings)
 *   6. PRICING hardcoded ב-pricing.ts (last resort)
 *
 * Lazy import של prisma כדי שטסטים pure לא יידרשו DATABASE_URL.
 */
export async function fetchAndResolveSubscriptionPrice(
  ctx: SubscriptionResolveContext
): Promise<ResolvedSubscriptionPrice> {
  const { default: prisma } = await import("@/lib/prisma");
  const orFilter: Prisma.PricingPolicyWhereInput[] = [
    { scope: "GLOBAL" },
    { scope: "USER", userId: ctx.userId },
  ];
  if (ctx.organizationId !== null) {
    orFilter.push({ scope: "ORGANIZATION", organizationId: ctx.organizationId });
    orFilter.push({
      scope: "CLINIC_MEMBER",
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
  }

  const policies = await prisma.pricingPolicy.findMany({
    where: {
      planTier: ctx.planTier,
      validFrom: { lte: ctx.now },
      OR: orFilter,
      AND: [
        {
          OR: [{ validUntil: null }, { validUntil: { gt: ctx.now } }],
        },
      ],
    },
    select: {
      id: true,
      scope: true,
      organizationId: true,
      userId: true,
      planTier: true,
      monthlyIls: true,
      quarterlyIls: true,
      halfYearIls: true,
      yearlyIls: true,
      validFrom: true,
      validUntil: true,
    },
  });

  // משתמשים בפונקציה ה-pure פעם אחת — אם source != FALLBACK,
  // זה אומר שמצאנו policy והוא הסמכות העליונה (חוסך סריקה כפולה).
  const fromPolicies = resolveSubscriptionPriceFromPolicies(policies, ctx);
  if (fromPolicies.source !== "FALLBACK") {
    return fromPolicies;
  }

  // אין policy — ננסה TierLimits מ-DB לפני שניפול ל-PRICING hardcoded.
  // זה המקור שמתעדכן מ-/admin/tier-settings (UI הניהול הראשי).
  const tierLimits = await prisma.tierLimits.findUnique({
    where: { tier: ctx.planTier },
    select: {
      priceMonthly: true,
      discountQuarterly: true,
      discountSemiAnnual: true,
      discountAnnual: true,
    },
  });

  const dbMonthly =
    tierLimits && tierLimits.priceMonthly > 0
      ? Number(tierLimits.priceMonthly)
      : null;

  if (dbMonthly !== null && Number.isFinite(dbMonthly) && dbMonthly > 0) {
    const derived = deriveMultiPeriodPrices(dbMonthly, {
      quarterly: tierLimits!.discountQuarterly,
      semiAnnual: tierLimits!.discountSemiAnnual,
      annual: tierLimits!.discountAnnual,
    });
    return {
      source: "TIER_LIMITS",
      policyId: null,
      planTier: ctx.planTier,
      monthlyIls: dbMonthly,
      quarterlyIls: derived.quarterly,
      halfYearIls: derived.halfYear,
      yearlyIls: derived.yearly,
    };
  }

  // Last resort — PRICING hardcoded (מתקבל מ-fromPolicies שכבר נתפס)
  return fromPolicies;
}

/**
 * Batch version של fetchAndResolveSubscriptionPrice עבור מספר tiers.
 *
 * אופטימיזציה ל-/api/subscription/tiers שצריך מחירים ל-3 tiers:
 * במקום 6 קריאות DB (3 × findMany + 3 × findUnique), עושה 2 קריאות בלבד
 * (findMany אחת על PricingPolicy עם planTier IN, ו-findMany אחת על TierLimits).
 *
 * סדר עדיפויות זהה ל-fetchAndResolveSubscriptionPrice.
 */
export async function fetchAndResolveSubscriptionPricesForTiers(
  baseCtx: Omit<SubscriptionResolveContext, "planTier">,
  tiers: AITier[]
): Promise<Map<AITier, ResolvedSubscriptionPrice>> {
  const { default: prisma } = await import("@/lib/prisma");

  const orFilter: Prisma.PricingPolicyWhereInput[] = [
    { scope: "GLOBAL" },
    { scope: "USER", userId: baseCtx.userId },
  ];
  if (baseCtx.organizationId !== null) {
    orFilter.push({ scope: "ORGANIZATION", organizationId: baseCtx.organizationId });
    orFilter.push({
      scope: "CLINIC_MEMBER",
      organizationId: baseCtx.organizationId,
      userId: baseCtx.userId,
    });
  }

  const [allPolicies, allTierLimits] = await Promise.all([
    prisma.pricingPolicy.findMany({
      where: {
        planTier: { in: tiers },
        validFrom: { lte: baseCtx.now },
        OR: orFilter,
        AND: [
          {
            OR: [{ validUntil: null }, { validUntil: { gt: baseCtx.now } }],
          },
        ],
      },
      select: {
        id: true,
        scope: true,
        organizationId: true,
        userId: true,
        planTier: true,
        monthlyIls: true,
        quarterlyIls: true,
        halfYearIls: true,
        yearlyIls: true,
        validFrom: true,
        validUntil: true,
      },
    }),
    prisma.tierLimits.findMany({
      where: { tier: { in: tiers } },
      select: {
        tier: true,
        priceMonthly: true,
        discountQuarterly: true,
        discountSemiAnnual: true,
        discountAnnual: true,
      },
    }),
  ]);

  const tierLimitsMap = new Map<AITier, { monthly: number; discountQuarterly: number; discountSemiAnnual: number; discountAnnual: number }>();
  for (const tl of allTierLimits) {
    if (tl.priceMonthly > 0) {
      tierLimitsMap.set(tl.tier, {
        monthly: Number(tl.priceMonthly),
        discountQuarterly: tl.discountQuarterly,
        discountSemiAnnual: tl.discountSemiAnnual,
        discountAnnual: tl.discountAnnual,
      });
    }
  }

  const result = new Map<AITier, ResolvedSubscriptionPrice>();
  for (const tier of tiers) {
    const ctx: SubscriptionResolveContext = { ...baseCtx, planTier: tier };
    const policiesForTier = allPolicies.filter((p) => p.planTier === tier);
    const fromPolicies = resolveSubscriptionPriceFromPolicies(policiesForTier, ctx);

    if (fromPolicies.source !== "FALLBACK") {
      result.set(tier, fromPolicies);
      continue;
    }

    const tlData = tierLimitsMap.get(tier);
    if (tlData && Number.isFinite(tlData.monthly) && tlData.monthly > 0) {
      const derived = deriveMultiPeriodPrices(tlData.monthly, {
        quarterly: tlData.discountQuarterly,
        semiAnnual: tlData.discountSemiAnnual,
        annual: tlData.discountAnnual,
      });
      result.set(tier, {
        source: "TIER_LIMITS",
        policyId: null,
        planTier: tier,
        monthlyIls: tlData.monthly,
        quarterlyIls: derived.quarterly,
        halfYearIls: derived.halfYear,
        yearlyIls: derived.yearly,
      });
      continue;
    }

    result.set(tier, fromPolicies);
  }

  return result;
}

/**
 * Bulk prefetch של כל ה-PricingPolicies הפעילים + כל ה-TierLimits.
 * משמש cron-jobs שצריכים לחשב מחיר עבור הרבה users בלי N+1.
 *
 * הפונקציה מחזירה PriceResolver — פונקציה pure שמקבלת ctx ומחזירה מחיר מ-cache
 * (זהה לוגית ל-fetchAndResolveSubscriptionPrice אבל ללא DB calls).
 *
 * שימוש:
 *   const resolver = await prefetchSubscriptionPriceResolver(now);
 *   for (const user of users) {
 *     const price = resolver({ userId: user.id, organizationId: user.organizationId, planTier: user.aiTier, now });
 *   }
 *
 * חיסכון: 100 users × 2 DB queries = 200 → 2 DB queries בלבד (לכל ה-cron).
 */
export async function prefetchSubscriptionPriceResolver(
  now: Date
): Promise<(ctx: SubscriptionResolveContext) => ResolvedSubscriptionPrice> {
  const { default: prisma } = await import("@/lib/prisma");

  const [allPolicies, allTierLimits] = await Promise.all([
    prisma.pricingPolicy.findMany({
      where: {
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      select: {
        id: true,
        scope: true,
        organizationId: true,
        userId: true,
        planTier: true,
        monthlyIls: true,
        quarterlyIls: true,
        halfYearIls: true,
        yearlyIls: true,
        validFrom: true,
        validUntil: true,
      },
    }),
    prisma.tierLimits.findMany({
      select: {
        tier: true,
        priceMonthly: true,
        discountQuarterly: true,
        discountSemiAnnual: true,
        discountAnnual: true,
      },
    }),
  ]);

  const tierLimitsMap = new Map<AITier, { monthly: number; discountQuarterly: number; discountSemiAnnual: number; discountAnnual: number }>();
  for (const tl of allTierLimits) {
    if (tl.priceMonthly > 0) {
      tierLimitsMap.set(tl.tier, {
        monthly: Number(tl.priceMonthly),
        discountQuarterly: tl.discountQuarterly,
        discountSemiAnnual: tl.discountSemiAnnual,
        discountAnnual: tl.discountAnnual,
      });
    }
  }

  return (ctx) => {
    const fromPolicies = resolveSubscriptionPriceFromPolicies(allPolicies, ctx);
    if (fromPolicies.source !== "FALLBACK") {
      return fromPolicies;
    }

    const tlData = tierLimitsMap.get(ctx.planTier);
    if (tlData && Number.isFinite(tlData.monthly) && tlData.monthly > 0) {
      const derived = deriveMultiPeriodPrices(tlData.monthly, {
        quarterly: tlData.discountQuarterly,
        semiAnnual: tlData.discountSemiAnnual,
        annual: tlData.discountAnnual,
      });
      return {
        source: "TIER_LIMITS",
        policyId: null,
        planTier: ctx.planTier,
        monthlyIls: tlData.monthly,
        quarterlyIls: derived.quarterly,
        halfYearIls: derived.halfYear,
        yearlyIls: derived.yearly,
      };
    }

    return fromPolicies;
  };
}

/**
 * שולף policies רלוונטיים לחבילה ומחזיר מחיר. אם אין — נופל ל-Package.priceIls מהקטלוג.
 */
export async function fetchAndResolvePackagePrice(
  ctx: PackageResolveContext
): Promise<ResolvedPackagePrice> {
  const { default: prisma } = await import("@/lib/prisma");
  const orFilter: Prisma.PackagePricingPolicyWhereInput[] = [
    { scope: "GLOBAL" },
    { scope: "USER", userId: ctx.userId },
  ];
  if (ctx.organizationId !== null) {
    orFilter.push({ scope: "ORGANIZATION", organizationId: ctx.organizationId });
    orFilter.push({
      scope: "CLINIC_MEMBER",
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
  }

  const policies = await prisma.packagePricingPolicy.findMany({
    where: {
      packageType: ctx.packageType,
      credits: ctx.credits,
      validFrom: { lte: ctx.now },
      OR: orFilter,
      AND: [
        {
          OR: [{ validUntil: null }, { validUntil: { gt: ctx.now } }],
        },
      ],
    },
    select: {
      id: true,
      scope: true,
      organizationId: true,
      userId: true,
      packageType: true,
      credits: true,
      priceIls: true,
      validFrom: true,
      validUntil: true,
    },
  });

  return resolvePackagePriceFromPolicies(policies, ctx);
}
