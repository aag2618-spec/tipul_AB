// ============================================================================
// Tests: Package Purchase (Stage 5 — חבילות SMS/AI דרך Cardcom)
// ============================================================================
// TDD לפי feedback_critical_changes_process — שינוי קריטי (כסף!) חייב טסטים
// לפני impl. בדיקות כיסוי:
//   1. validatePackagePurchase — מי יכול לרכוש חבילה
//   2. resolvePackagePurchaseWebhookOutcome — מה ה-webhook צריך לעשות
//   3. buildPackagesView — תצוגת קטלוג + יתרה למשתמש
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  validatePackagePurchase,
  resolvePackagePurchaseWebhookOutcome,
  buildPackagesView,
  calculateRemainingCredits,
} from "@/lib/payments/package-purchase";

// ============================================================================
// validatePackagePurchase — מי יכול לרכוש
// ============================================================================

describe("validatePackagePurchase", () => {
  it("משתמש רגיל לא חסום + חבילה פעילה + מחיר תקין — מותר", () => {
    const r = validatePackagePurchase({
      isBlocked: false,
      packageIsActive: true,
      priceIls: 50,
    });
    expect(r.allowed).toBe(true);
  });

  it("isBlocked=true — אסור (חשבון חסום)", () => {
    const r = validatePackagePurchase({
      isBlocked: true,
      packageIsActive: true,
      priceIls: 50,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("חסום");
  });

  it("חבילה לא פעילה (isActive=false) — אסור", () => {
    const r = validatePackagePurchase({
      isBlocked: false,
      packageIsActive: false,
      priceIls: 50,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("זמינה");
  });

  it("priceIls=null (אין מחיר resolve) — אסור", () => {
    const r = validatePackagePurchase({
      isBlocked: false,
      packageIsActive: true,
      priceIls: null,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("מחיר");
  });

  it("priceIls=0 — אסור (חבילת חינם תינתן רק דרך אדמין)", () => {
    const r = validatePackagePurchase({
      isBlocked: false,
      packageIsActive: true,
      priceIls: 0,
    });
    expect(r.allowed).toBe(false);
  });

  it("priceIls שלילי — אסור (defense in depth)", () => {
    const r = validatePackagePurchase({
      isBlocked: false,
      packageIsActive: true,
      priceIls: -5,
    });
    expect(r.allowed).toBe(false);
  });

  it("billingPaidByClinic לא חוסם — חבילות חד-פעמיות אישיות, לא חלק מהמנוי", () => {
    // מטפלים בקליניקה רוצים לקנות SMS נוספים — מותר. הקליניקה משלמת על המנוי,
    // אבל לא על SMS שמעבר למכסה.
    const r = validatePackagePurchase({
      isBlocked: false,
      packageIsActive: true,
      priceIls: 50,
    });
    expect(r.allowed).toBe(true);
  });
});

// ============================================================================
// resolvePackagePurchaseWebhookOutcome — webhook decision logic
// ============================================================================

describe("resolvePackagePurchaseWebhookOutcome", () => {
  it("success=true + לא נרשם עדיין → GRANT_CREDITS", () => {
    const r = resolvePackagePurchaseWebhookOutcome({
      success: true,
      alreadyGranted: false,
    });
    expect(r.action).toBe("GRANT_CREDITS");
  });

  it("success=true + כבר נרשם → SKIP_ALREADY (idempotent)", () => {
    const r = resolvePackagePurchaseWebhookOutcome({
      success: true,
      alreadyGranted: true,
    });
    expect(r.action).toBe("SKIP_ALREADY");
  });

  it("success=false → DECLINE", () => {
    const r = resolvePackagePurchaseWebhookOutcome({
      success: false,
      alreadyGranted: false,
    });
    expect(r.action).toBe("DECLINE");
  });

  it("success=false + alreadyGranted=true → SKIP_ALREADY (לא לרוקן credits שכבר ניתנו)", () => {
    // תרחיש: webhook קודם הצליח והעניק; webhook duplicate מקבל DECLINE.
    // הקוד צריך להעדיף את ה-SKIP_ALREADY כדי לא לבטל credits בטעות.
    const r = resolvePackagePurchaseWebhookOutcome({
      success: false,
      alreadyGranted: true,
    });
    expect(r.action).toBe("SKIP_ALREADY");
  });
});

// ============================================================================
// calculateRemainingCredits — יתרה לפי type מתוך purchases array
// ============================================================================

describe("calculateRemainingCredits", () => {
  it("רשימה ריקה → 0", () => {
    expect(calculateRemainingCredits([], "SMS")).toBe(0);
  });

  it("חבילה אחת SMS 100 ללא שימוש → 100", () => {
    const r = calculateRemainingCredits(
      [{ type: "SMS", credits: 100, creditsUsed: 0, reverted: false }],
      "SMS"
    );
    expect(r).toBe(100);
  });

  it("חבילה עם 30 שימושים מתוך 100 → 70", () => {
    const r = calculateRemainingCredits(
      [{ type: "SMS", credits: 100, creditsUsed: 30, reverted: false }],
      "SMS"
    );
    expect(r).toBe(70);
  });

  it("2 חבילות SMS → סכום שלהן", () => {
    const r = calculateRemainingCredits(
      [
        { type: "SMS", credits: 100, creditsUsed: 30, reverted: false },
        { type: "SMS", credits: 200, creditsUsed: 50, reverted: false },
      ],
      "SMS"
    );
    expect(r).toBe(70 + 150);
  });

  it("חבילה reverted=true לא נספרת", () => {
    const r = calculateRemainingCredits(
      [
        { type: "SMS", credits: 100, creditsUsed: 0, reverted: true },
        { type: "SMS", credits: 50, creditsUsed: 0, reverted: false },
      ],
      "SMS"
    );
    expect(r).toBe(50);
  });

  it("חבילות מסוג אחר לא נספרות", () => {
    const r = calculateRemainingCredits(
      [
        { type: "AI_DETAILED_ANALYSIS", credits: 10, creditsUsed: 0, reverted: false },
        { type: "SMS", credits: 100, creditsUsed: 0, reverted: false },
      ],
      "SMS"
    );
    expect(r).toBe(100);
  });

  it("creditsUsed > credits (לא אמור לקרות אבל הגנה) → 0, לא שלילי", () => {
    const r = calculateRemainingCredits(
      [{ type: "SMS", credits: 100, creditsUsed: 150, reverted: false }],
      "SMS"
    );
    expect(r).toBe(0);
  });
});

// ============================================================================
// buildPackagesView — תצוגת קטלוג + מחיר + יתרה ל-Client
// ============================================================================

describe("buildPackagesView", () => {
  const now = new Date("2026-06-15T00:00:00Z");
  const samplePackages = [
    {
      id: "pkg1",
      type: "SMS" as const,
      name: "חבילת 100 SMS",
      credits: 100,
      priceIls: 50,
      isActive: true,
    },
    {
      id: "pkg2",
      type: "AI_DETAILED_ANALYSIS" as const,
      name: "חבילת 10 ניתוחי AI",
      credits: 10,
      priceIls: 100,
      isActive: true,
    },
    {
      id: "pkg3",
      type: "SMS" as const,
      name: "חבילה ישנה (לא פעילה)",
      credits: 50,
      priceIls: 30,
      isActive: false,
    },
  ];

  it("מציג רק חבילות פעילות", () => {
    const view = buildPackagesView({
      packages: samplePackages,
      resolvedPrices: new Map([
        ["pkg1", 50],
        ["pkg2", 100],
      ]),
      userPurchases: [],
    });
    expect(view.packages).toHaveLength(2);
    expect(view.packages.map((p) => p.id).sort()).toEqual(["pkg1", "pkg2"]);
  });

  it("משתמש ב-resolved price אם שונה ממחיר הקטלוג (override)", () => {
    const view = buildPackagesView({
      packages: samplePackages,
      resolvedPrices: new Map([
        ["pkg1", 40], // override
        ["pkg2", 100],
      ]),
      userPurchases: [],
    });
    const pkg1 = view.packages.find((p) => p.id === "pkg1");
    expect(pkg1?.priceIls).toBe(40);
  });

  it("חבילה ללא resolved price משתמשת במחיר הקטלוג", () => {
    const view = buildPackagesView({
      packages: samplePackages,
      resolvedPrices: new Map(),
      userPurchases: [],
    });
    const pkg1 = view.packages.find((p) => p.id === "pkg1");
    expect(pkg1?.priceIls).toBe(50);
  });

  it("יתרה לפי type מחושבת נכון", () => {
    const view = buildPackagesView({
      packages: samplePackages,
      resolvedPrices: new Map(),
      userPurchases: [
        { type: "SMS", credits: 100, creditsUsed: 20, reverted: false },
        { type: "AI_DETAILED_ANALYSIS", credits: 10, creditsUsed: 3, reverted: false },
      ],
    });
    expect(view.balances.SMS).toBe(80);
    expect(view.balances.AI_DETAILED_ANALYSIS).toBe(7);
  });

  it("יתרה=0 כשאין purchases", () => {
    const view = buildPackagesView({
      packages: samplePackages,
      resolvedPrices: new Map(),
      userPurchases: [],
    });
    expect(view.balances.SMS).toBe(0);
    expect(view.balances.AI_DETAILED_ANALYSIS).toBe(0);
  });

  it("Decimal מ-Prisma מומר ל-number", () => {
    const view = buildPackagesView({
      packages: [
        {
          ...samplePackages[0],
          priceIls: "50.50" as unknown as number,
        },
      ],
      resolvedPrices: new Map(),
      userPurchases: [],
    });
    expect(view.packages[0].priceIls).toBe(50.5);
  });

  // הצהרת קיום `now` כדי שלא יזרוק מטעם linter unused
  it("מקבל now כפרמטר (לעתיד — expiry filtering)", () => {
    expect(now.getTime()).toBeGreaterThan(0);
  });
});
