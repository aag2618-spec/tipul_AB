// ==================== Tests: Pricing Resolver ====================
// TDD לפי feedback_critical_changes_process — שינוי קריטי (כסף!) חייב טסטים לפני impl.
//
// מטרת ה-resolver: למצוא את המחיר הנכון למשתמש לפי סדר עדיפויות:
//   USER → CLINIC_MEMBER → ORGANIZATION → GLOBAL → fallback (pricing.ts hardcoded)
//
// העיצוב הוא pure-function שמקבל מערך של policies + context, ומחזיר מחיר.
// פעולות DB (Prisma query) נשארות מחוץ ל-resolver כדי שיהיה testable.

import { describe, it, expect } from "vitest";
import {
  pickActivePolicy,
  resolveSubscriptionPriceFromPolicies,
  resolvePackagePriceFromPolicies,
  getPriceForPeriod,
  deriveMultiPeriodPrices,
  type ResolvableSubscriptionPolicy,
  type ResolvablePackagePolicy,
  type SubscriptionResolveContext,
  type PackageResolveContext,
} from "@/lib/pricing/resolve";

// ============================================================================
// Helpers
// ============================================================================

const ts = (iso: string) => new Date(iso);

const NOW = ts("2026-06-01T10:00:00Z");

function mkPolicy(
  partial: Partial<ResolvableSubscriptionPolicy>
): ResolvableSubscriptionPolicy {
  return {
    id: partial.id ?? "p1",
    scope: partial.scope ?? "GLOBAL",
    organizationId: partial.organizationId ?? null,
    userId: partial.userId ?? null,
    planTier: partial.planTier ?? "PRO",
    monthlyIls: partial.monthlyIls ?? 100,
    quarterlyIls: partial.quarterlyIls ?? null,
    halfYearIls: partial.halfYearIls ?? null,
    yearlyIls: partial.yearlyIls ?? null,
    validFrom: partial.validFrom ?? ts("2026-01-01"),
    validUntil: partial.validUntil ?? null,
  };
}

function mkPackagePolicy(
  partial: Partial<ResolvablePackagePolicy>
): ResolvablePackagePolicy {
  return {
    id: partial.id ?? "pp1",
    scope: partial.scope ?? "GLOBAL",
    organizationId: partial.organizationId ?? null,
    userId: partial.userId ?? null,
    packageType: partial.packageType ?? "SMS",
    credits: partial.credits ?? 100,
    priceIls: partial.priceIls ?? 50,
    validFrom: partial.validFrom ?? ts("2026-01-01"),
    validUntil: partial.validUntil ?? null,
  };
}

// ============================================================================
// pickActivePolicy — בחירת policy פעיל בנקודת זמן
// ============================================================================

describe("pickActivePolicy", () => {
  it("מחזיר null אם אין policies", () => {
    expect(pickActivePolicy([], NOW)).toBeNull();
  });

  it("מחזיר policy פעיל יחיד", () => {
    const policy = mkPolicy({ monthlyIls: 150 });
    expect(pickActivePolicy([policy], NOW)).toEqual(policy);
  });

  it("מסנן policy שעדיין לא נכנס לתוקף (validFrom > now)", () => {
    const future = mkPolicy({ validFrom: ts("2027-01-01") });
    expect(pickActivePolicy([future], NOW)).toBeNull();
  });

  it("מסנן policy שפג תוקפו (validUntil < now)", () => {
    const expired = mkPolicy({ validUntil: ts("2026-05-01") });
    expect(pickActivePolicy([expired], NOW)).toBeNull();
  });

  it("validUntil=null = פעיל ללא הגבלה", () => {
    const eternal = mkPolicy({ validUntil: null });
    expect(pickActivePolicy([eternal], NOW)).toEqual(eternal);
  });

  it("מבין כמה policies פעילים — מחזיר את הטרי ביותר (validFrom)", () => {
    const old = mkPolicy({ id: "old", validFrom: ts("2026-01-01"), monthlyIls: 100 });
    const fresh = mkPolicy({ id: "fresh", validFrom: ts("2026-05-01"), monthlyIls: 200 });
    const result = pickActivePolicy([old, fresh], NOW);
    expect(result?.id).toBe("fresh");
    expect(result?.monthlyIls).toBe(200);
  });

  it("validFrom בדיוק עכשיו — נחשב פעיל", () => {
    const justNow = mkPolicy({ validFrom: NOW });
    expect(pickActivePolicy([justNow], NOW)).not.toBeNull();
  });

  it("validUntil בדיוק עכשיו — נחשב פג (boundary סגור)", () => {
    const justExpired = mkPolicy({ validUntil: NOW });
    expect(pickActivePolicy([justExpired], NOW)).toBeNull();
  });
});

// ============================================================================
// resolveSubscriptionPriceFromPolicies — סדר עדיפויות
// ============================================================================

describe("resolveSubscriptionPriceFromPolicies — סדר עדיפויות", () => {
  const ctx: SubscriptionResolveContext = {
    userId: "u1",
    organizationId: "o1",
    planTier: "PRO",
    now: NOW,
  };

  it("USER policy גובר על כל השאר", () => {
    const policies = [
      mkPolicy({ scope: "GLOBAL", monthlyIls: 100 }),
      mkPolicy({ scope: "ORGANIZATION", organizationId: "o1", monthlyIls: 90 }),
      mkPolicy({ scope: "CLINIC_MEMBER", userId: "u1", organizationId: "o1", monthlyIls: 80 }),
      mkPolicy({ scope: "USER", userId: "u1", monthlyIls: 50 }),
    ];
    const r = resolveSubscriptionPriceFromPolicies(policies, ctx);
    expect(r.monthlyIls).toBe(50);
    expect(r.source).toBe("USER");
  });

  it("בלי USER → CLINIC_MEMBER גובר", () => {
    const policies = [
      mkPolicy({ scope: "GLOBAL", monthlyIls: 100 }),
      mkPolicy({ scope: "ORGANIZATION", organizationId: "o1", monthlyIls: 90 }),
      mkPolicy({ scope: "CLINIC_MEMBER", userId: "u1", organizationId: "o1", monthlyIls: 80 }),
    ];
    const r = resolveSubscriptionPriceFromPolicies(policies, ctx);
    expect(r.monthlyIls).toBe(80);
    expect(r.source).toBe("CLINIC_MEMBER");
  });

  it("בלי USER/CLINIC_MEMBER → ORGANIZATION גובר", () => {
    const policies = [
      mkPolicy({ scope: "GLOBAL", monthlyIls: 100 }),
      mkPolicy({ scope: "ORGANIZATION", organizationId: "o1", monthlyIls: 90 }),
    ];
    const r = resolveSubscriptionPriceFromPolicies(policies, ctx);
    expect(r.monthlyIls).toBe(90);
    expect(r.source).toBe("ORGANIZATION");
  });

  it("רק GLOBAL → נופל ל-GLOBAL", () => {
    const policies = [mkPolicy({ scope: "GLOBAL", monthlyIls: 100 })];
    const r = resolveSubscriptionPriceFromPolicies(policies, ctx);
    expect(r.monthlyIls).toBe(100);
    expect(r.source).toBe("GLOBAL");
  });

  it("אין policies → נופל ל-fallback מ-pricing.ts (PRO=145)", () => {
    const r = resolveSubscriptionPriceFromPolicies([], ctx);
    expect(r.monthlyIls).toBe(145); // PRO ברירת מחדל
    expect(r.source).toBe("FALLBACK");
  });

  it("ORG policy של ארגון אחר — לא רלוונטית למשתמש שלי", () => {
    const policies = [
      mkPolicy({ scope: "ORGANIZATION", organizationId: "other-org", monthlyIls: 70 }),
      mkPolicy({ scope: "GLOBAL", monthlyIls: 100 }),
    ];
    const r = resolveSubscriptionPriceFromPolicies(policies, ctx);
    expect(r.monthlyIls).toBe(100);
    expect(r.source).toBe("GLOBAL");
  });

  it("USER policy של משתמש אחר — לא רלוונטית", () => {
    const policies = [
      mkPolicy({ scope: "USER", userId: "other-user", monthlyIls: 30 }),
      mkPolicy({ scope: "GLOBAL", monthlyIls: 100 }),
    ];
    const r = resolveSubscriptionPriceFromPolicies(policies, ctx);
    expect(r.monthlyIls).toBe(100);
    expect(r.source).toBe("GLOBAL");
  });

  it("planTier שונה — לא רלוונטי (ENTERPRISE לא ייבחר ל-PRO)", () => {
    const policies = [
      mkPolicy({ scope: "USER", userId: "u1", planTier: "ENTERPRISE", monthlyIls: 50 }),
      mkPolicy({ scope: "GLOBAL", planTier: "PRO", monthlyIls: 100 }),
    ];
    const r = resolveSubscriptionPriceFromPolicies(policies, ctx);
    expect(r.monthlyIls).toBe(100);
    expect(r.source).toBe("GLOBAL");
  });

  it("ארגון null במשתמש — CLINIC_MEMBER לא יחול גם אם userId תואם", () => {
    const ctxNoOrg = { ...ctx, organizationId: null };
    const policies = [
      mkPolicy({ scope: "CLINIC_MEMBER", userId: "u1", organizationId: "o1", monthlyIls: 80 }),
      mkPolicy({ scope: "GLOBAL", monthlyIls: 100 }),
    ];
    const r = resolveSubscriptionPriceFromPolicies(policies, ctxNoOrg);
    expect(r.monthlyIls).toBe(100);
    expect(r.source).toBe("GLOBAL");
  });

  it("policy שפג תוקפו — דילוג ל-fallback", () => {
    const policies = [
      mkPolicy({ scope: "USER", userId: "u1", validUntil: ts("2026-05-01"), monthlyIls: 30 }),
    ];
    const r = resolveSubscriptionPriceFromPolicies(policies, ctx);
    expect(r.source).toBe("FALLBACK");
    expect(r.monthlyIls).toBe(145);
  });

  it("שני USER policies פעילים — הטרי ביותר נבחר", () => {
    const policies = [
      mkPolicy({
        scope: "USER",
        userId: "u1",
        validFrom: ts("2026-01-01"),
        monthlyIls: 50,
      }),
      mkPolicy({
        scope: "USER",
        userId: "u1",
        validFrom: ts("2026-04-01"),
        monthlyIls: 60,
      }),
    ];
    const r = resolveSubscriptionPriceFromPolicies(policies, ctx);
    expect(r.monthlyIls).toBe(60);
    expect(r.source).toBe("USER");
  });
});

// ============================================================================
// getPriceForPeriod — חישוב מחיר לפי תקופה
// ============================================================================

describe("getPriceForPeriod", () => {
  it("חודש בודד — monthlyIls", () => {
    const result = {
      source: "GLOBAL" as const,
      planTier: "PRO" as const,
      monthlyIls: 145,
      quarterlyIls: 413,
      halfYearIls: 783,
      yearlyIls: 1450,
    };
    expect(getPriceForPeriod(result, 1)).toBe(145);
  });

  it("3 חודשים — quarterlyIls אם קיים", () => {
    const result = {
      source: "GLOBAL" as const,
      planTier: "PRO" as const,
      monthlyIls: 145,
      quarterlyIls: 413,
      halfYearIls: null,
      yearlyIls: null,
    };
    expect(getPriceForPeriod(result, 3)).toBe(413);
  });

  // ── Fallback semantics (2026-05-24): כשתקופה ספציפית null, ה-fallback משתמש
  // בהנחה הסטנדרטית של deriveMultiPeriodPrices (×0.95/×0.9/×10) במקום ×N ישן.
  // עקבי עם TierLimits flow — אדמין שיוצר PricingPolicy עם monthly בלבד מקבל
  // אותו מחיר כמו אדמין שמשנה ב-/admin/tier-settings.
  it("3 חודשים בלי quarterlyIls — fallback עם הנחה (×0.95)", () => {
    const result = {
      source: "USER" as const,
      planTier: "PRO" as const,
      monthlyIls: 100,
      quarterlyIls: null,
      halfYearIls: null,
      yearlyIls: null,
    };
    // 100 × 3 × 0.95 = 285
    expect(getPriceForPeriod(result, 3)).toBe(285);
  });

  it("6 חודשים בלי halfYearIls — fallback עם הנחה (×0.9)", () => {
    const result = {
      source: "USER" as const,
      planTier: "PRO" as const,
      monthlyIls: 100,
      quarterlyIls: null,
      halfYearIls: null,
      yearlyIls: null,
    };
    // 100 × 6 × 0.9 = 540
    expect(getPriceForPeriod(result, 6)).toBe(540);
  });

  it("12 חודשים בלי yearlyIls — fallback עם הנחת 17%", () => {
    const result = {
      source: "USER" as const,
      planTier: "PRO" as const,
      monthlyIls: 100,
      quarterlyIls: null,
      halfYearIls: null,
      yearlyIls: null,
    };
    // 100 * 12 * 0.83 = 996
    expect(getPriceForPeriod(result, 12)).toBe(996);
  });

  it("monthly לא תקין (0) + fallback — מחזיר ×N הישן בלי לזרוק", () => {
    const result = {
      source: "USER" as const,
      planTier: "PRO" as const,
      monthlyIls: 0,
      quarterlyIls: null,
      halfYearIls: null,
      yearlyIls: null,
    };
    // הגנה: deriveMultiPeriodPrices זורק על monthly<=0, אז getPriceForPeriod
    // נופל בחזרה ל-monthly*N (כאן 0). לעולם לא לזרוק מתוך getPriceForPeriod.
    expect(getPriceForPeriod(result, 3)).toBe(0);
    expect(getPriceForPeriod(result, 6)).toBe(0);
    expect(getPriceForPeriod(result, 12)).toBe(0);
  });

  it("PricingPolicy עם yearlyIls explicit — לא מחיל הנחה (override)", () => {
    const result = {
      source: "USER" as const,
      planTier: "PRO" as const,
      monthlyIls: 100,
      quarterlyIls: null,
      halfYearIls: null,
      yearlyIls: 1200, // אדמין מילא explicit ×12 ללא הנחה
    };
    expect(getPriceForPeriod(result, 12)).toBe(1200);
  });

  it("תקופה לא חוקית — שגיאה", () => {
    const result = {
      source: "GLOBAL" as const,
      planTier: "PRO" as const,
      monthlyIls: 145,
      quarterlyIls: null,
      halfYearIls: null,
      yearlyIls: null,
    };
    expect(() => getPriceForPeriod(result, 5 as 1 | 3 | 6 | 12)).toThrow();
  });
});

// ============================================================================
// resolvePackagePriceFromPolicies
// ============================================================================

describe("resolvePackagePriceFromPolicies", () => {
  const ctx: PackageResolveContext = {
    userId: "u1",
    organizationId: "o1",
    packageType: "SMS",
    credits: 100,
    now: NOW,
  };

  it("USER policy גובר", () => {
    const policies = [
      mkPackagePolicy({ scope: "GLOBAL", priceIls: 50 }),
      mkPackagePolicy({ scope: "USER", userId: "u1", priceIls: 30 }),
    ];
    const r = resolvePackagePriceFromPolicies(policies, ctx);
    expect(r.priceIls).toBe(30);
    expect(r.source).toBe("USER");
  });

  it("credits שונה — לא רלוונטי", () => {
    const policies = [
      mkPackagePolicy({ scope: "USER", userId: "u1", credits: 500, priceIls: 100 }),
      mkPackagePolicy({ scope: "GLOBAL", credits: 100, priceIls: 50 }),
    ];
    const r = resolvePackagePriceFromPolicies(policies, ctx);
    expect(r.priceIls).toBe(50);
    expect(r.source).toBe("GLOBAL");
  });

  it("packageType שונה — לא רלוונטי (AI לא משנה ל-SMS)", () => {
    const policies = [
      mkPackagePolicy({
        scope: "USER",
        userId: "u1",
        packageType: "AI_DETAILED_ANALYSIS",
        priceIls: 30,
      }),
      mkPackagePolicy({ scope: "GLOBAL", packageType: "SMS", priceIls: 50 }),
    ];
    const r = resolvePackagePriceFromPolicies(policies, ctx);
    expect(r.priceIls).toBe(50);
    expect(r.source).toBe("GLOBAL");
  });

  it("אין policies — מחזיר null (אין fallback hardcoded לחבילות)", () => {
    const r = resolvePackagePriceFromPolicies([], ctx);
    expect(r.source).toBe("NONE");
    expect(r.priceIls).toBeNull();
  });

  it("ORG policy עובד לקליניקה", () => {
    const policies = [
      mkPackagePolicy({ scope: "ORGANIZATION", organizationId: "o1", priceIls: 40 }),
      mkPackagePolicy({ scope: "GLOBAL", priceIls: 50 }),
    ];
    const r = resolvePackagePriceFromPolicies(policies, ctx);
    expect(r.priceIls).toBe(40);
    expect(r.source).toBe("ORGANIZATION");
  });
});

// ============================================================================
// deriveMultiPeriodPrices — חישוב מחירי תקופות מהחודשי (TierLimits fallback)
// ============================================================================

describe("deriveMultiPeriodPrices", () => {
  it("מחיר 117 ש\"ח — ברירת מחדל (5%/10%/17%)", () => {
    const result = deriveMultiPeriodPrices(117);
    expect(result.quarterly).toBe(333); // 117 * 3 * 0.95 = 333.45 → 333
    expect(result.halfYear).toBe(632); // 117 * 6 * 0.90 = 631.8 → 632
    expect(result.yearly).toBe(1165); // 117 * 12 * 0.83 = 1165.32 → 1165
  });

  it("מחיר 145 ש\"ח (PRO) — ברירת מחדל", () => {
    const result = deriveMultiPeriodPrices(145);
    expect(result.quarterly).toBe(413); // 145 * 3 * 0.95 = 413.25 → 413
    expect(result.halfYear).toBe(783); // 145 * 6 * 0.90 = 783
    expect(result.yearly).toBe(1444); // 145 * 12 * 0.83 = 1444.2 → 1444
  });

  it("מחיר 100 ש\"ח עם הנחות מותאמות", () => {
    const result = deriveMultiPeriodPrices(100, { quarterly: 10, semiAnnual: 15, annual: 20 });
    expect(result.quarterly).toBe(270); // 100 * 3 * 0.90 = 270
    expect(result.halfYear).toBe(510); // 100 * 6 * 0.85 = 510
    expect(result.yearly).toBe(960);   // 100 * 12 * 0.80 = 960
  });

  it("ללא הנחה (0%) — מחיר מלא", () => {
    const result = deriveMultiPeriodPrices(100, { quarterly: 0, semiAnnual: 0, annual: 0 });
    expect(result.quarterly).toBe(300);
    expect(result.halfYear).toBe(600);
    expect(result.yearly).toBe(1200);
  });

  it("זורק על monthly=0 — מניעת חיוב 0 ש\"ח", () => {
    expect(() => deriveMultiPeriodPrices(0)).toThrow(/positive finite number/);
  });

  it("זורק על monthly שלילי", () => {
    expect(() => deriveMultiPeriodPrices(-50)).toThrow(/positive finite number/);
  });

  it("זורק על NaN", () => {
    expect(() => deriveMultiPeriodPrices(NaN)).toThrow(/positive finite number/);
  });

  it("זורק על Infinity", () => {
    expect(() => deriveMultiPeriodPrices(Infinity)).toThrow(/positive finite number/);
  });
});
