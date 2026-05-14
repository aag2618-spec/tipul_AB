// ==================== Pricing Resolver ====================
// מוצא את המחיר הנכון למשתמש לפי סדר עדיפויות:
//   USER → CLINIC_MEMBER → ORGANIZATION → GLOBAL → fallback (pricing.ts hardcoded)
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

export type ResolvedSubscriptionPrice = {
  source: PricingScope | "FALLBACK";
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
 * מחיר לתקופה ספציפית. אם אין מחיר ספציפי לתקופה ב-policy, מכפיל את monthlyIls.
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
      return price.quarterlyIls ?? price.monthlyIls * 3;
    case 6:
      return price.halfYearIls ?? price.monthlyIls * 6;
    case 12:
      return price.yearlyIls ?? price.monthlyIls * 12;
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
 *
 * סינון מקדים ב-DB: רק policies שיכולים להיות רלוונטיים (לפי userId/orgId/global).
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

  return resolveSubscriptionPriceFromPolicies(policies, ctx);
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
