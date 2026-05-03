import { describe, it, expect } from "vitest";
import {
  computeEffectivePrice,
  isCustomContractActive,
  calcTherapistFee,
  calcSecretaryFee,
  type PriceInputs,
} from "@/lib/pricing/effective-price";

const basePlan: PriceInputs["plan"] = {
  baseFeeIls: 200,
  includedTherapists: 1,
  perTherapistFeeIls: 80,
  volumeDiscountAtCount: null,
  perTherapistAtVolumeIls: null,
  freeSecretaries: 3,
  perSecretaryFeeIls: 25,
};

const planWithVolume: PriceInputs["plan"] = {
  ...basePlan,
  volumeDiscountAtCount: 10,
  perTherapistAtVolumeIls: 60, // discount: 60 instead of 80
};

describe("isCustomContractActive", () => {
  const ts = (iso: string) => new Date(iso);

  it("null contract → not active", () => {
    expect(isCustomContractActive(null, ts("2026-05-01"))).toBe(false);
  });

  it("active when asOf in window", () => {
    expect(
      isCustomContractActive(
        {
          monthlyEquivPriceIls: 500,
          startDate: ts("2026-01-01"),
          endDate: ts("2027-01-01"),
        },
        ts("2026-05-01")
      )
    ).toBe(true);
  });

  it("inactive before startDate", () => {
    expect(
      isCustomContractActive(
        {
          monthlyEquivPriceIls: 500,
          startDate: ts("2026-06-01"),
          endDate: ts("2027-01-01"),
        },
        ts("2026-05-01")
      )
    ).toBe(false);
  });

  it("inactive on/after endDate (exclusive end)", () => {
    expect(
      isCustomContractActive(
        {
          monthlyEquivPriceIls: 500,
          startDate: ts("2026-01-01"),
          endDate: ts("2026-05-01"),
        },
        ts("2026-05-01") // exact end
      )
    ).toBe(false);
  });
});

describe("calcTherapistFee", () => {
  it("0 chargeable when therapists <= included", () => {
    expect(calcTherapistFee(basePlan, 1)).toEqual({
      fee: 0,
      chargeable: 0,
      volumeApplied: false,
    });
    expect(calcTherapistFee(basePlan, 0)).toEqual({
      fee: 0,
      chargeable: 0,
      volumeApplied: false,
    });
  });

  it("standard fee for chargeable therapists", () => {
    expect(calcTherapistFee(basePlan, 5)).toEqual({
      fee: 4 * 80, // 320
      chargeable: 4,
      volumeApplied: false,
    });
  });

  it("no volume kicks in below threshold", () => {
    expect(calcTherapistFee(planWithVolume, 9)).toEqual({
      fee: 8 * 80,
      chargeable: 8,
      volumeApplied: false,
    });
  });

  it("volume discount kicks in at threshold", () => {
    expect(calcTherapistFee(planWithVolume, 10)).toEqual({
      fee: 9 * 60, // discounted
      chargeable: 9,
      volumeApplied: true,
    });
  });

  it("volume discount applies above threshold", () => {
    expect(calcTherapistFee(planWithVolume, 15)).toEqual({
      fee: 14 * 60,
      chargeable: 14,
      volumeApplied: true,
    });
  });
});

describe("calcSecretaryFee", () => {
  it("0 fee when secretaries <= free", () => {
    expect(calcSecretaryFee(basePlan, 0)).toEqual({ fee: 0, chargeable: 0 });
    expect(calcSecretaryFee(basePlan, 3)).toEqual({ fee: 0, chargeable: 0 });
  });

  it("charges per chargeable secretary", () => {
    expect(calcSecretaryFee(basePlan, 5)).toEqual({
      fee: 2 * 25, // 50
      chargeable: 2,
    });
  });

  it("returns 0 when perSecretaryFeeIls is null even if over freeSecretaries", () => {
    const planNoSecFee = { ...basePlan, perSecretaryFeeIls: null };
    expect(calcSecretaryFee(planNoSecFee, 10)).toEqual({ fee: 0, chargeable: 0 });
  });
});

describe("computeEffectivePrice — pricing plan path", () => {
  const asOf = new Date("2026-05-01");

  it("simple — base only when no chargeable members", () => {
    const result = computeEffectivePrice({
      customContract: null,
      plan: basePlan,
      counts: { therapists: 1, secretaries: 0 },
      asOf,
    });
    expect(result.monthlyTotalIls).toBe(200);
    expect(result.source).toBe("pricing_plan");
    expect(result.hasCustomContract).toBe(false);
    expect(result.breakdown.therapistsFeeIls).toBe(0);
    expect(result.breakdown.secretariesFeeIls).toBe(0);
  });

  it("base + chargeable therapists + chargeable secretaries", () => {
    const result = computeEffectivePrice({
      customContract: null,
      plan: basePlan,
      counts: { therapists: 4, secretaries: 5 },
      asOf,
    });
    // 200 + (3 * 80) + (2 * 25) = 200 + 240 + 50 = 490
    expect(result.monthlyTotalIls).toBe(490);
    expect(result.breakdown.chargeableTherapists).toBe(3);
    expect(result.breakdown.chargeableSecretaries).toBe(2);
    expect(result.breakdown.volumeDiscountApplied).toBe(false);
  });

  it("applies volume discount", () => {
    const result = computeEffectivePrice({
      customContract: null,
      plan: planWithVolume,
      counts: { therapists: 12, secretaries: 0 },
      asOf,
    });
    // 200 + (11 * 60) = 860, volume applied
    expect(result.monthlyTotalIls).toBe(860);
    expect(result.breakdown.volumeDiscountApplied).toBe(true);
    expect(result.breakdown.chargeableTherapists).toBe(11);
  });
});

describe("computeEffectivePrice — custom contract path", () => {
  const asOf = new Date("2026-05-01");

  it("custom contract overrides plan when active", () => {
    const result = computeEffectivePrice({
      customContract: {
        monthlyEquivPriceIls: 1500,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      },
      plan: basePlan,
      counts: { therapists: 100, secretaries: 100 },
      asOf,
    });
    expect(result.monthlyTotalIls).toBe(1500);
    expect(result.hasCustomContract).toBe(true);
    expect(result.source).toBe("custom_contract");
    expect(result.breakdown.therapistsFeeIls).toBe(0);
    expect(result.breakdown.secretariesFeeIls).toBe(0);
  });

  it("expired contract falls back to plan", () => {
    const result = computeEffectivePrice({
      customContract: {
        monthlyEquivPriceIls: 1500,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2026-01-01"), // expired before asOf
      },
      plan: basePlan,
      counts: { therapists: 4, secretaries: 0 },
      asOf,
    });
    expect(result.source).toBe("pricing_plan");
    expect(result.hasCustomContract).toBe(false);
    // 200 + (3 * 80) = 440
    expect(result.monthlyTotalIls).toBe(440);
  });

  it("future contract not yet started → fall back to plan", () => {
    const result = computeEffectivePrice({
      customContract: {
        monthlyEquivPriceIls: 1500,
        startDate: new Date("2027-01-01"),
        endDate: new Date("2028-01-01"),
      },
      plan: basePlan,
      counts: { therapists: 1, secretaries: 0 },
      asOf,
    });
    expect(result.source).toBe("pricing_plan");
    expect(result.monthlyTotalIls).toBe(200);
  });
});
