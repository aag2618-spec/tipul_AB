// ============================================================================
// Tests: Clinic Limits Resolver
// ============================================================================
// TDD לפי feedback_critical_changes_process.
//
// סדר עדיפויות:
//   1. אם CustomContract פעיל (startDate<=now<=endDate) ויש customMaxTherapists
//      → גובר על pricingPlan.maxTherapists.
//   2. אחרת — pricingPlan.maxTherapists.
//   3. null = ללא הגבלה (כמו ב-schema).
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  resolveTherapistLimit,
  resolveSecretaryLimit,
  checkLimit,
  type ResolvableContract,
  type ResolvablePlan,
} from "@/lib/clinic/limits-helpers";

const ts = (iso: string) => new Date(iso);
const NOW = ts("2026-06-01T10:00:00Z");

const basicPlan: ResolvablePlan = {
  maxTherapists: 5,
  maxSecretaries: 3,
};

// ============================================================================
// resolveTherapistLimit
// ============================================================================

describe("resolveTherapistLimit", () => {
  it("ללא חוזה — מחזיר את התקרה של התוכנית", () => {
    const result = resolveTherapistLimit({ plan: basicPlan, contract: null, now: NOW });
    expect(result).toBe(5);
  });

  it("חוזה פעיל עם customMaxTherapists — גובר על התוכנית", () => {
    const contract: ResolvableContract = {
      startDate: ts("2026-01-01"),
      endDate: ts("2027-01-01"),
      customMaxTherapists: 10,
      customMaxSecretaries: null,
    };
    const result = resolveTherapistLimit({ plan: basicPlan, contract, now: NOW });
    expect(result).toBe(10);
  });

  it("חוזה פעיל ללא customMaxTherapists — נופל לתוכנית", () => {
    const contract: ResolvableContract = {
      startDate: ts("2026-01-01"),
      endDate: ts("2027-01-01"),
      customMaxTherapists: null,
      customMaxSecretaries: 20,
    };
    const result = resolveTherapistLimit({ plan: basicPlan, contract, now: NOW });
    expect(result).toBe(5);
  });

  it("חוזה פג תוקף — נופל לתוכנית", () => {
    const contract: ResolvableContract = {
      startDate: ts("2025-01-01"),
      endDate: ts("2025-12-31"), // עבר
      customMaxTherapists: 100,
      customMaxSecretaries: null,
    };
    const result = resolveTherapistLimit({ plan: basicPlan, contract, now: NOW });
    expect(result).toBe(5);
  });

  it("חוזה עתידי (טרם נכנס לתוקף) — נופל לתוכנית", () => {
    const contract: ResolvableContract = {
      startDate: ts("2027-01-01"),
      endDate: ts("2028-01-01"),
      customMaxTherapists: 100,
      customMaxSecretaries: null,
    };
    const result = resolveTherapistLimit({ plan: basicPlan, contract, now: NOW });
    expect(result).toBe(5);
  });

  it("תוכנית עם maxTherapists=null — ללא הגבלה (null)", () => {
    const result = resolveTherapistLimit({
      plan: { maxTherapists: null, maxSecretaries: 3 },
      contract: null,
      now: NOW,
    });
    expect(result).toBeNull();
  });

  it("חוזה עם customMaxTherapists=0 — 0 (גובר)", () => {
    const contract: ResolvableContract = {
      startDate: ts("2026-01-01"),
      endDate: ts("2027-01-01"),
      customMaxTherapists: 0,
      customMaxSecretaries: null,
    };
    const result = resolveTherapistLimit({ plan: basicPlan, contract, now: NOW });
    expect(result).toBe(0);
  });
});

// ============================================================================
// resolveSecretaryLimit
// ============================================================================

describe("resolveSecretaryLimit", () => {
  it("ללא חוזה — מחזיר את התקרה של התוכנית", () => {
    const result = resolveSecretaryLimit({ plan: basicPlan, contract: null, now: NOW });
    expect(result).toBe(3);
  });

  it("חוזה פעיל עם customMaxSecretaries — גובר", () => {
    const contract: ResolvableContract = {
      startDate: ts("2026-01-01"),
      endDate: ts("2027-01-01"),
      customMaxTherapists: null,
      customMaxSecretaries: 10,
    };
    const result = resolveSecretaryLimit({ plan: basicPlan, contract, now: NOW });
    expect(result).toBe(10);
  });

  it("תוכנית עם maxSecretaries=null — null", () => {
    const result = resolveSecretaryLimit({
      plan: { maxTherapists: 5, maxSecretaries: null },
      contract: null,
      now: NOW,
    });
    expect(result).toBeNull();
  });
});

// ============================================================================
// checkLimit — boundary cases
// ============================================================================

describe("checkLimit", () => {
  it("current < max → allowed", () => {
    const result = checkLimit({ current: 3, max: 5 });
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(3);
    expect(result.max).toBe(5);
    expect(result.remaining).toBe(2);
  });

  it("current === max → לא מותר (already at limit)", () => {
    const result = checkLimit({ current: 5, max: 5 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.message).toContain("הגעת לתקרה");
  });

  it("current > max → לא מותר (over limit — defensive)", () => {
    const result = checkLimit({ current: 6, max: 5 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("max === null → ללא הגבלה (תמיד allowed)", () => {
    const result = checkLimit({ current: 999, max: null });
    expect(result.allowed).toBe(true);
    expect(result.max).toBeNull();
    expect(result.remaining).toBeNull();
  });

  it("max === 0 → אסור הוספה (גם אם current=0)", () => {
    const result = checkLimit({ current: 0, max: 0 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("current === 0, max === 1 → allowed", () => {
    const result = checkLimit({ current: 0, max: 1 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("הודעה בעברית כשחורגים", () => {
    const result = checkLimit({ current: 5, max: 5 });
    expect(result.message).toBeDefined();
    expect(result.message).toMatch(/[֐-׿]/); // עברית
  });
});
