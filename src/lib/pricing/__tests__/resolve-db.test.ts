// ==================== Integration Tests: Pricing Resolver DB Wrappers ====================
// בודק את ה-wrappers ש-DB-aware: fetchAndResolveSubscriptionPrice,
// fetchAndResolveSubscriptionPricesForTiers, ו-prefetchSubscriptionPriceResolver.
//
// בניגוד ל-resolve.test.ts (pure), הקובץ הזה מ-mock-ה את prisma ובודק:
//   - source="TIER_LIMITS" — מסלול חדש שנוסף ב-resolve.ts (2026-05-23)
//   - source="FALLBACK" — מסלול PRICING hardcoded
//   - מספר ה-DB calls (חיסכון N+1)
//   - prefetchSubscriptionPriceResolver — pre-fetch לcron jobs
//
// Setup: vi.mock("@/lib/prisma") — לא דורש DATABASE_URL.

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Prisma mock ─────────────────────────────────────────────────────────

const pricingPolicyFindMany = vi.fn();
const tierLimitsFindUnique = vi.fn();
const tierLimitsFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    pricingPolicy: {
      findMany: (...args: unknown[]) => pricingPolicyFindMany(...args),
    },
    tierLimits: {
      findUnique: (...args: unknown[]) => tierLimitsFindUnique(...args),
      findMany: (...args: unknown[]) => tierLimitsFindMany(...args),
    },
  },
}));

import {
  fetchAndResolveSubscriptionPrice,
  fetchAndResolveSubscriptionPricesForTiers,
  prefetchSubscriptionPriceResolver,
} from "@/lib/pricing/resolve";

// ─── Helpers ─────────────────────────────────────────────────────────────

const NOW = new Date("2026-06-01T10:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── fetchAndResolveSubscriptionPrice ────────────────────────────────────

describe("fetchAndResolveSubscriptionPrice", () => {
  it("מחזיר policy USER כשקיים (source=USER)", async () => {
    pricingPolicyFindMany.mockResolvedValue([
      {
        id: "p1",
        scope: "USER",
        organizationId: null,
        userId: "u1",
        planTier: "PRO",
        monthlyIls: 99,
        quarterlyIls: 282,
        halfYearIls: 535,
        yearlyIls: 990,
        validFrom: new Date("2026-01-01"),
        validUntil: null,
      },
    ]);

    const result = await fetchAndResolveSubscriptionPrice({
      userId: "u1",
      organizationId: null,
      planTier: "PRO",
      now: NOW,
    });

    expect(result.source).toBe("USER");
    expect(result.policyId).toBe("p1");
    expect(result.monthlyIls).toBe(99);
    expect(result.yearlyIls).toBe(990);
    // לא נדרש לפנות ל-TierLimits כשיש policy
    expect(tierLimitsFindUnique).not.toHaveBeenCalled();
  });

  it("נופל ל-TIER_LIMITS כשאין policy אבל יש priceMonthly", async () => {
    pricingPolicyFindMany.mockResolvedValue([]);
    tierLimitsFindUnique.mockResolvedValue({ priceMonthly: 150 });

    const result = await fetchAndResolveSubscriptionPrice({
      userId: "u1",
      organizationId: null,
      planTier: "PRO",
      now: NOW,
    });

    expect(result.source).toBe("TIER_LIMITS");
    expect(result.policyId).toBe(null);
    expect(result.monthlyIls).toBe(150);
    // נוסחת derive עם הנחות סטנדרטיות
    expect(result.quarterlyIls).toBe(Math.round(150 * 3 * 0.95)); // 428
    expect(result.halfYearIls).toBe(Math.round(150 * 6 * 0.9)); // 810
    expect(result.yearlyIls).toBe(Math.round(150 * 12 * 0.83)); // 1494
  });

  it("נופל ל-FALLBACK (PRICING) כשאין policy ואין TierLimits תקין", async () => {
    pricingPolicyFindMany.mockResolvedValue([]);
    tierLimitsFindUnique.mockResolvedValue(null);

    const result = await fetchAndResolveSubscriptionPrice({
      userId: "u1",
      organizationId: null,
      planTier: "PRO",
      now: NOW,
    });

    expect(result.source).toBe("FALLBACK");
    expect(result.monthlyIls).toBeGreaterThan(0); // מ-PRICING hardcoded
  });

  it("מתעלם מ-TierLimits עם priceMonthly=0 (מתייחס כלא תקין)", async () => {
    pricingPolicyFindMany.mockResolvedValue([]);
    tierLimitsFindUnique.mockResolvedValue({ priceMonthly: 0 });

    const result = await fetchAndResolveSubscriptionPrice({
      userId: "u1",
      organizationId: null,
      planTier: "PRO",
      now: NOW,
    });

    // 0 = לא תקין → fallback ל-PRICING (לא TIER_LIMITS)
    expect(result.source).toBe("FALLBACK");
  });
});

// ─── fetchAndResolveSubscriptionPricesForTiers (batch) ───────────────────

describe("fetchAndResolveSubscriptionPricesForTiers", () => {
  it("מחזיר מחירים ל-3 tiers ב-2 DB queries בלבד", async () => {
    pricingPolicyFindMany.mockResolvedValue([]);
    tierLimitsFindMany.mockResolvedValue([
      { tier: "ESSENTIAL", priceMonthly: 99 },
      { tier: "PRO", priceMonthly: 199 },
      { tier: "ENTERPRISE", priceMonthly: 399 },
    ]);

    const result = await fetchAndResolveSubscriptionPricesForTiers(
      { userId: "u1", organizationId: null, now: NOW },
      ["ESSENTIAL", "PRO", "ENTERPRISE"]
    );

    expect(result.size).toBe(3);
    expect(result.get("ESSENTIAL")?.source).toBe("TIER_LIMITS");
    expect(result.get("ESSENTIAL")?.monthlyIls).toBe(99);
    expect(result.get("PRO")?.monthlyIls).toBe(199);
    expect(result.get("ENTERPRISE")?.monthlyIls).toBe(399);

    // חיסכון N+1: בדיוק 2 DB queries (findMany על PricingPolicy + findMany על TierLimits)
    expect(pricingPolicyFindMany).toHaveBeenCalledTimes(1);
    expect(tierLimitsFindMany).toHaveBeenCalledTimes(1);
    // לא קוראים ל-findUnique בכלל בbatch
    expect(tierLimitsFindUnique).not.toHaveBeenCalled();
  });

  it("מיקסס policy עבור tier אחד + TIER_LIMITS לשני", async () => {
    pricingPolicyFindMany.mockResolvedValue([
      {
        id: "p1",
        scope: "USER",
        organizationId: null,
        userId: "u1",
        planTier: "PRO",
        monthlyIls: 250, // dovride
        quarterlyIls: null,
        halfYearIls: null,
        yearlyIls: null,
        validFrom: new Date("2026-01-01"),
        validUntil: null,
      },
    ]);
    tierLimitsFindMany.mockResolvedValue([
      { tier: "ESSENTIAL", priceMonthly: 99 },
      { tier: "PRO", priceMonthly: 199 }, // יידרס ע"י policy
    ]);

    const result = await fetchAndResolveSubscriptionPricesForTiers(
      { userId: "u1", organizationId: null, now: NOW },
      ["ESSENTIAL", "PRO"]
    );

    expect(result.get("ESSENTIAL")?.source).toBe("TIER_LIMITS");
    expect(result.get("ESSENTIAL")?.monthlyIls).toBe(99);
    expect(result.get("PRO")?.source).toBe("USER");
    expect(result.get("PRO")?.monthlyIls).toBe(250);
  });
});

// ─── prefetchSubscriptionPriceResolver ───────────────────────────────────

describe("prefetchSubscriptionPriceResolver", () => {
  it("resolver מחזיר מחיר policy עבור user שיש לו USER policy", async () => {
    pricingPolicyFindMany.mockResolvedValue([
      {
        id: "p1",
        scope: "USER",
        organizationId: null,
        userId: "u1",
        planTier: "PRO",
        monthlyIls: 100,
        quarterlyIls: null,
        halfYearIls: null,
        yearlyIls: null,
        validFrom: new Date("2026-01-01"),
        validUntil: null,
      },
    ]);
    tierLimitsFindMany.mockResolvedValue([]);

    const resolver = await prefetchSubscriptionPriceResolver(NOW);
    const result = resolver({
      userId: "u1",
      organizationId: null,
      planTier: "PRO",
      now: NOW,
    });

    expect(result.source).toBe("USER");
    expect(result.monthlyIls).toBe(100);
  });

  it("resolver מחזיר TIER_LIMITS עבור tier ללא policy", async () => {
    pricingPolicyFindMany.mockResolvedValue([]);
    tierLimitsFindMany.mockResolvedValue([
      { tier: "PRO", priceMonthly: 150 },
    ]);

    const resolver = await prefetchSubscriptionPriceResolver(NOW);
    const result = resolver({
      userId: "u-no-policy",
      organizationId: null,
      planTier: "PRO",
      now: NOW,
    });

    expect(result.source).toBe("TIER_LIMITS");
    expect(result.monthlyIls).toBe(150);
    expect(result.yearlyIls).toBe(Math.round(150 * 12 * 0.83)); // 1494
  });

  it("resolver נופל ל-FALLBACK אם אין policy ולא TierLimits ל-tier", async () => {
    pricingPolicyFindMany.mockResolvedValue([]);
    tierLimitsFindMany.mockResolvedValue([]);

    const resolver = await prefetchSubscriptionPriceResolver(NOW);
    const result = resolver({
      userId: "u1",
      organizationId: null,
      planTier: "PRO",
      now: NOW,
    });

    expect(result.source).toBe("FALLBACK");
    expect(result.monthlyIls).toBeGreaterThan(0);
  });

  it("prefetch עושה רק 2 DB queries ללא תלות במספר users שיתבקשו אחר כך", async () => {
    pricingPolicyFindMany.mockResolvedValue([]);
    tierLimitsFindMany.mockResolvedValue([
      { tier: "PRO", priceMonthly: 100 },
    ]);

    const resolver = await prefetchSubscriptionPriceResolver(NOW);

    // קריאות resolver — אפס DB calls נוספים
    resolver({ userId: "u1", organizationId: null, planTier: "PRO", now: NOW });
    resolver({ userId: "u2", organizationId: null, planTier: "PRO", now: NOW });
    resolver({ userId: "u3", organizationId: null, planTier: "PRO", now: NOW });

    expect(pricingPolicyFindMany).toHaveBeenCalledTimes(1);
    expect(tierLimitsFindMany).toHaveBeenCalledTimes(1);
  });

  it("resolver מבדיל בין users עם policies שונים (לא מערבב)", async () => {
    pricingPolicyFindMany.mockResolvedValue([
      {
        id: "p-u1",
        scope: "USER",
        organizationId: null,
        userId: "u1",
        planTier: "PRO",
        monthlyIls: 100,
        quarterlyIls: null,
        halfYearIls: null,
        yearlyIls: null,
        validFrom: new Date("2026-01-01"),
        validUntil: null,
      },
      {
        id: "p-u2",
        scope: "USER",
        organizationId: null,
        userId: "u2",
        planTier: "PRO",
        monthlyIls: 200,
        quarterlyIls: null,
        halfYearIls: null,
        yearlyIls: null,
        validFrom: new Date("2026-01-01"),
        validUntil: null,
      },
    ]);
    tierLimitsFindMany.mockResolvedValue([]);

    const resolver = await prefetchSubscriptionPriceResolver(NOW);
    const r1 = resolver({ userId: "u1", organizationId: null, planTier: "PRO", now: NOW });
    const r2 = resolver({ userId: "u2", organizationId: null, planTier: "PRO", now: NOW });
    const r3 = resolver({ userId: "u3", organizationId: null, planTier: "PRO", now: NOW });

    expect(r1.monthlyIls).toBe(100);
    expect(r2.monthlyIls).toBe(200);
    // u3 ללא policy → fallback
    expect(r3.source).toBe("FALLBACK");
  });
});
