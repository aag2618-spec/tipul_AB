import { describe, it, expect } from "vitest";
import {
  compareAiTierRank,
  isOrgTierUpgrade,
  resolveOrgAiTier,
} from "../ai-tier-inheritance";

// M11.E1: בדיקות יחידה ל-helper של ירושת aiTier.
// מטרה: לוודא שהלוגיקה של "שדרוג בלבד" + "CustomContract גובר על plan" + "תוקף חוזה"
// פועלת נכון לכל הפרמוטציות.

describe("compareAiTierRank", () => {
  it("ENTERPRISE > PRO > ESSENTIAL", () => {
    expect(compareAiTierRank("PRO", "ESSENTIAL")).toBeGreaterThan(0);
    expect(compareAiTierRank("ENTERPRISE", "PRO")).toBeGreaterThan(0);
    expect(compareAiTierRank("ENTERPRISE", "ESSENTIAL")).toBeGreaterThan(0);
  });

  it("returns 0 for equal tiers", () => {
    expect(compareAiTierRank("PRO", "PRO")).toBe(0);
    expect(compareAiTierRank("ESSENTIAL", "ESSENTIAL")).toBe(0);
    expect(compareAiTierRank("ENTERPRISE", "ENTERPRISE")).toBe(0);
  });

  it("returns negative for downgrade direction", () => {
    expect(compareAiTierRank("ESSENTIAL", "PRO")).toBeLessThan(0);
    expect(compareAiTierRank("PRO", "ENTERPRISE")).toBeLessThan(0);
  });
});

describe("isOrgTierUpgrade", () => {
  it("returns true only when org tier is strictly higher", () => {
    expect(isOrgTierUpgrade("ESSENTIAL", "PRO")).toBe(true);
    expect(isOrgTierUpgrade("ESSENTIAL", "ENTERPRISE")).toBe(true);
    expect(isOrgTierUpgrade("PRO", "ENTERPRISE")).toBe(true);
  });

  it("returns false for equal tiers (no-op)", () => {
    expect(isOrgTierUpgrade("PRO", "PRO")).toBe(false);
    expect(isOrgTierUpgrade("ENTERPRISE", "ENTERPRISE")).toBe(false);
  });

  it("returns false for downgrade (anti-downgrade guard)", () => {
    expect(isOrgTierUpgrade("ENTERPRISE", "PRO")).toBe(false);
    expect(isOrgTierUpgrade("PRO", "ESSENTIAL")).toBe(false);
  });
});

describe("resolveOrgAiTier", () => {
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const pastDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  it("returns null when no plan and no contract", () => {
    expect(resolveOrgAiTier({})).toBe(null);
    expect(resolveOrgAiTier({ pricingPlan: null, customContract: null })).toBe(
      null
    );
  });

  it("returns plan tier when no custom contract", () => {
    expect(
      resolveOrgAiTier({
        pricingPlan: { aiTierIncluded: "PRO" },
      })
    ).toBe("PRO");
  });

  it("returns null when plan has no aiTierIncluded", () => {
    expect(
      resolveOrgAiTier({
        pricingPlan: { aiTierIncluded: null },
      })
    ).toBe(null);
  });

  it("custom contract aiTier overrides plan when active", () => {
    expect(
      resolveOrgAiTier({
        pricingPlan: { aiTierIncluded: "PRO" },
        customContract: {
          customAiTier: "ENTERPRISE",
          endDate: futureDate,
          autoRenew: false,
        },
      })
    ).toBe("ENTERPRISE");
  });

  it("custom contract null aiTier falls back to plan (semantics: 'use plan')", () => {
    expect(
      resolveOrgAiTier({
        pricingPlan: { aiTierIncluded: "PRO" },
        customContract: {
          customAiTier: null,
          endDate: futureDate,
          autoRenew: false,
        },
      })
    ).toBe("PRO");
  });

  it("expired contract without autoRenew falls back to plan", () => {
    expect(
      resolveOrgAiTier({
        pricingPlan: { aiTierIncluded: "ESSENTIAL" },
        customContract: {
          customAiTier: "ENTERPRISE",
          endDate: pastDate,
          autoRenew: false,
        },
      })
    ).toBe("ESSENTIAL");
  });

  it("expired contract WITH autoRenew still uses custom tier", () => {
    expect(
      resolveOrgAiTier({
        pricingPlan: { aiTierIncluded: "ESSENTIAL" },
        customContract: {
          customAiTier: "ENTERPRISE",
          endDate: pastDate,
          autoRenew: true,
        },
      })
    ).toBe("ENTERPRISE");
  });

  it("contract without endDate is treated as active (defensive)", () => {
    expect(
      resolveOrgAiTier({
        pricingPlan: { aiTierIncluded: "ESSENTIAL" },
        customContract: {
          customAiTier: "ENTERPRISE",
          endDate: null,
          autoRenew: false,
        },
      })
    ).toBe("ENTERPRISE");
  });

  it("accepts string endDate (ISO format from JSON.parse(JSON.stringify(...)))", () => {
    expect(
      resolveOrgAiTier({
        pricingPlan: { aiTierIncluded: "PRO" },
        customContract: {
          customAiTier: "ENTERPRISE",
          endDate: futureDate.toISOString(),
          autoRenew: false,
        },
      })
    ).toBe("ENTERPRISE");
  });

  it("accepts custom now parameter for deterministic testing", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const before = new Date("2026-05-01T00:00:00Z");
    const after = new Date("2026-07-01T00:00:00Z");

    expect(
      resolveOrgAiTier(
        {
          pricingPlan: { aiTierIncluded: "PRO" },
          customContract: {
            customAiTier: "ENTERPRISE",
            endDate: after,
            autoRenew: false,
          },
        },
        now
      )
    ).toBe("ENTERPRISE");

    expect(
      resolveOrgAiTier(
        {
          pricingPlan: { aiTierIncluded: "PRO" },
          customContract: {
            customAiTier: "ENTERPRISE",
            endDate: before,
            autoRenew: false,
          },
        },
        now
      )
    ).toBe("PRO");
  });
});
