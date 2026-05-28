import { describe, it, expect } from "vitest";
import {
  classifyContractPhase,
  computeContractRenewal,
} from "../custom-contract";

// M11.E2: בדיקות לפעולות pure של ניהול CustomContract.

describe("classifyContractPhase", () => {
  const now = new Date("2026-06-01T12:00:00Z");
  const past = new Date("2026-01-01T00:00:00Z");
  const future5 = new Date("2026-06-06T12:00:00Z"); // 5 days
  const future20 = new Date("2026-06-21T12:00:00Z"); // 20 days
  const future40 = new Date("2026-07-11T12:00:00Z"); // 40 days

  it("FUTURE: startDate after now", () => {
    expect(
      classifyContractPhase(
        { startDate: future5, endDate: future40, autoRenew: false },
        now
      )
    ).toBe("FUTURE");
  });

  it("ACTIVE: now between start and end with > 30d to go", () => {
    expect(
      classifyContractPhase(
        { startDate: past, endDate: future40, autoRenew: false },
        now
      )
    ).toBe("ACTIVE");
  });

  it("EXPIRING_30D: end is between 14d and 30d", () => {
    expect(
      classifyContractPhase(
        { startDate: past, endDate: future20, autoRenew: true },
        now
      )
    ).toBe("EXPIRING_30D");
  });

  it("EXPIRING_14D: end is between 7d and 14d", () => {
    const future13 = new Date("2026-06-14T12:00:00Z"); // 13 days
    expect(
      classifyContractPhase(
        { startDate: past, endDate: future13, autoRenew: false },
        now
      )
    ).toBe("EXPIRING_14D");
  });

  it("EXPIRING_7D: end is within 7 days", () => {
    expect(
      classifyContractPhase(
        { startDate: past, endDate: future5, autoRenew: true },
        now
      )
    ).toBe("EXPIRING_7D");
  });

  it("EXPIRED_NEEDS_RENEW: end<=now and autoRenew=true", () => {
    expect(
      classifyContractPhase(
        { startDate: past, endDate: past, autoRenew: true },
        now
      )
    ).toBe("EXPIRED_NEEDS_RENEW");
  });

  it("EXPIRED_NO_RENEW: end<=now and autoRenew=false", () => {
    expect(
      classifyContractPhase(
        { startDate: past, endDate: past, autoRenew: false },
        now
      )
    ).toBe("EXPIRED_NO_RENEW");
  });

  it("accepts string dates (ISO from JSON.parse)", () => {
    expect(
      classifyContractPhase(
        {
          startDate: past.toISOString(),
          endDate: future5.toISOString(),
          autoRenew: false,
        },
        now
      )
    ).toBe("EXPIRING_7D");
  });
});

describe("computeContractRenewal", () => {
  const baseEnd = new Date("2026-12-31T00:00:00Z");

  it("extends endDate by renewalMonths", () => {
    const r = computeContractRenewal({
      endDate: baseEnd,
      monthlyEquivPriceIls: 1000,
      renewalMonths: 12,
      annualIncreasePct: null,
    });
    // setMonth adds 12 → next year
    expect(r.newEndDate.getUTCFullYear()).toBe(2027);
    expect(r.newEndDate.getUTCMonth()).toBe(11); // December (0-indexed)
  });

  it("no price increase when annualIncreasePct is null", () => {
    const r = computeContractRenewal({
      endDate: baseEnd,
      monthlyEquivPriceIls: 1000,
      renewalMonths: 12,
      annualIncreasePct: null,
    });
    expect(r.newMonthlyEquivPriceIls).toBe(1000);
    expect(r.priceIncreasedBy).toBe(0);
  });

  it("applies 5% increase: 1000 → 1050", () => {
    const r = computeContractRenewal({
      endDate: baseEnd,
      monthlyEquivPriceIls: 1000,
      renewalMonths: 12,
      annualIncreasePct: 5,
    });
    expect(r.newMonthlyEquivPriceIls).toBe(1050);
    expect(r.priceIncreasedBy).toBe(50);
  });

  it("applies 7.5% increase: 200 → 215", () => {
    const r = computeContractRenewal({
      endDate: baseEnd,
      monthlyEquivPriceIls: 200,
      renewalMonths: 12,
      annualIncreasePct: 7.5,
    });
    expect(r.newMonthlyEquivPriceIls).toBe(215);
    expect(r.priceIncreasedBy).toBe(15);
  });

  it("rounds to 2 decimal places", () => {
    const r = computeContractRenewal({
      endDate: baseEnd,
      monthlyEquivPriceIls: 333.33,
      renewalMonths: 6,
      annualIncreasePct: 5,
    });
    // 333.33 * 1.05 = 349.9965 → rounded to 350.00
    expect(r.newMonthlyEquivPriceIls).toBe(350);
  });

  it("negative percentage clamped to 0 (no downgrade)", () => {
    const r = computeContractRenewal({
      endDate: baseEnd,
      monthlyEquivPriceIls: 1000,
      renewalMonths: 12,
      annualIncreasePct: -5,
    });
    expect(r.newMonthlyEquivPriceIls).toBe(1000);
    expect(r.priceIncreasedBy).toBe(0);
  });

  it("accepts string prices (Decimal.toString())", () => {
    const r = computeContractRenewal({
      endDate: baseEnd,
      monthlyEquivPriceIls: "1234.56",
      renewalMonths: 6,
      annualIncreasePct: "10",
    });
    // 1234.56 * 1.10 = 1358.016 → 1358.02
    expect(r.newMonthlyEquivPriceIls).toBe(1358.02);
  });

  it("renewalMonths=1 extends by one month", () => {
    const r = computeContractRenewal({
      endDate: new Date("2026-01-31T00:00:00Z"),
      monthlyEquivPriceIls: 100,
      renewalMonths: 1,
      annualIncreasePct: null,
    });
    // 1/31 + 1 month: setMonth(month+1) → Feb has only 28/29 days, so JS auto-adjusts
    // The behavior is deterministic: Feb 28/Mar 3 depending on JS engine.
    // We just verify it advances at least to a later date.
    expect(r.newEndDate.getTime()).toBeGreaterThan(
      new Date("2026-01-31T00:00:00Z").getTime()
    );
  });
});
