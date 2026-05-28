import { describe, it, expect } from "vitest";
import { parseIsraelTime } from "@/lib/date-utils";
import {
  computeMonthlyRevenueReport,
  monthRangeIsraelToUtc,
  resolveRevenueSharePct,
  sortByRevenue,
  type RevenueShareTherapistInput,
  type RevenueSharePaymentInput,
} from "../revenue-share";

// M11.G3: בדיקות יחידה לדוח פיצול הכנסות.
// הפונקציה דטרמיניסטית — לא תלויה ב-now/Date.now(). גבולות החודש
// מועברים ידנית; ה-API responsible לחשב אותם דרך parseIsraelTime.

const THERAPISTS: RevenueShareTherapistInput[] = [
  { id: "t1", name: "דנה", email: "dana@example.com", revenueSharePct: 70 },
  { id: "t2", name: "יוסי", email: "yossi@example.com", revenueSharePct: null },
  { id: "t3", name: null, email: "unnamed@example.com", revenueSharePct: 100 },
];

// מאי 2026 בזמן ישראל: 1 במאי 00:00 IL = 30 באפריל 21:00 UTC (קיץ);
// 1 ביוני 00:00 IL = 31 במאי 21:00 UTC.
const MAY_START_UTC = new Date("2026-04-30T21:00:00Z");
const MAY_END_UTC = new Date("2026-05-31T21:00:00Z");

function ilPayment(
  therapistId: string,
  isoLocal: string,
  amount: number
): RevenueSharePaymentInput {
  return {
    therapistId,
    paidAt: new Date(`${isoLocal}:00+03:00`),
    amount,
  };
}

describe("resolveRevenueSharePct — fallback chain", () => {
  it("returns user value when defined", () => {
    expect(resolveRevenueSharePct({ userPct: 75, orgDefaultPct: 60 })).toBe(75);
  });
  it("returns org default when user is null", () => {
    expect(resolveRevenueSharePct({ userPct: null, orgDefaultPct: 60 })).toBe(
      60
    );
  });
  it("returns 100 when both are null", () => {
    expect(
      resolveRevenueSharePct({ userPct: null, orgDefaultPct: null })
    ).toBe(100);
  });
  it("clamps negative user value to 0", () => {
    expect(resolveRevenueSharePct({ userPct: -10, orgDefaultPct: 50 })).toBe(0);
  });
  it("clamps user value > 100 to 100", () => {
    expect(resolveRevenueSharePct({ userPct: 150, orgDefaultPct: 50 })).toBe(
      100
    );
  });
  it("treats NaN as null and falls back", () => {
    expect(
      resolveRevenueSharePct({ userPct: Number.NaN, orgDefaultPct: 40 })
    ).toBe(40);
  });
  it("treats user=0 as explicit zero (not fallback)", () => {
    expect(resolveRevenueSharePct({ userPct: 0, orgDefaultPct: 50 })).toBe(0);
  });
});

describe("computeMonthlyRevenueReport — basic shape", () => {
  it("returns one row per therapist with zeros when there are no payments", () => {
    const result = computeMonthlyRevenueReport({
      therapists: THERAPISTS,
      orgDefaultPct: 50,
      payments: [],
      monthStartUtc: MAY_START_UTC,
      monthEndUtc: MAY_END_UTC,
    });
    expect(result.therapists).toHaveLength(3);
    for (const row of result.therapists) {
      expect(row.paidSessions).toBe(0);
      expect(row.totalPaidIls).toBe(0);
      expect(row.therapistRevenueIls).toBe(0);
      expect(row.clinicRevenueIls).toBe(0);
    }
    expect(result.totals.totalPaidIls).toBe(0);
    expect(result.totals.therapistRevenueIls).toBe(0);
    expect(result.totals.clinicRevenueIls).toBe(0);
  });

  it("applies user sharePct when set on the therapist", () => {
    const result = computeMonthlyRevenueReport({
      therapists: [THERAPISTS[0]],
      orgDefaultPct: 50,
      payments: [ilPayment("t1", "2026-05-10T09:00", 1000)],
      monthStartUtc: MAY_START_UTC,
      monthEndUtc: MAY_END_UTC,
    });
    const t1 = result.therapists[0];
    expect(t1.sharePct).toBe(70);
    expect(t1.totalPaidIls).toBe(1000);
    expect(t1.therapistRevenueIls).toBe(700);
    expect(t1.clinicRevenueIls).toBe(300);
  });

  it("falls back to org default when therapist sharePct is null", () => {
    const result = computeMonthlyRevenueReport({
      therapists: [THERAPISTS[1]],
      orgDefaultPct: 60,
      payments: [ilPayment("t2", "2026-05-15T10:00", 500)],
      monthStartUtc: MAY_START_UTC,
      monthEndUtc: MAY_END_UTC,
    });
    const t2 = result.therapists[0];
    expect(t2.sharePct).toBe(60);
    expect(t2.therapistRevenueIls).toBe(300);
    expect(t2.clinicRevenueIls).toBe(200);
  });

  it("falls back to 100% when both therapist and org defaults are null", () => {
    const result = computeMonthlyRevenueReport({
      therapists: [THERAPISTS[1]],
      orgDefaultPct: null,
      payments: [ilPayment("t2", "2026-05-15T10:00", 400)],
      monthStartUtc: MAY_START_UTC,
      monthEndUtc: MAY_END_UTC,
    });
    const t2 = result.therapists[0];
    expect(t2.sharePct).toBe(100);
    expect(t2.therapistRevenueIls).toBe(400);
    expect(t2.clinicRevenueIls).toBe(0);
  });

  it("counts paidSessions correctly (multiple payments same therapist)", () => {
    const result = computeMonthlyRevenueReport({
      therapists: [THERAPISTS[0]],
      orgDefaultPct: 50,
      payments: [
        ilPayment("t1", "2026-05-02T09:00", 300),
        ilPayment("t1", "2026-05-10T10:00", 350),
        ilPayment("t1", "2026-05-25T11:00", 350),
      ],
      monthStartUtc: MAY_START_UTC,
      monthEndUtc: MAY_END_UTC,
    });
    const t1 = result.therapists[0];
    expect(t1.paidSessions).toBe(3);
    expect(t1.totalPaidIls).toBe(1000);
    expect(t1.therapistRevenueIls).toBe(700);
  });
});

describe("computeMonthlyRevenueReport — filtering", () => {
  it("excludes payments paid before monthStartUtc", () => {
    const result = computeMonthlyRevenueReport({
      therapists: [THERAPISTS[0]],
      orgDefaultPct: 50,
      payments: [
        ilPayment("t1", "2026-04-30T20:00", 999),
        ilPayment("t1", "2026-05-01T01:00", 100),
      ],
      monthStartUtc: MAY_START_UTC,
      monthEndUtc: MAY_END_UTC,
    });
    expect(result.therapists[0].totalPaidIls).toBe(100);
    expect(result.therapists[0].paidSessions).toBe(1);
  });

  it("excludes payments paid at monthEndUtc (end is exclusive)", () => {
    const result = computeMonthlyRevenueReport({
      therapists: [THERAPISTS[0]],
      orgDefaultPct: 50,
      payments: [
        { therapistId: "t1", paidAt: MAY_END_UTC, amount: 500 },
        ilPayment("t1", "2026-05-31T20:00", 100),
      ],
      monthStartUtc: MAY_START_UTC,
      monthEndUtc: MAY_END_UTC,
    });
    expect(result.therapists[0].totalPaidIls).toBe(100);
  });

  it("ignores payments whose therapistId is not in the therapists list", () => {
    const result = computeMonthlyRevenueReport({
      therapists: [THERAPISTS[0]],
      orgDefaultPct: 50,
      payments: [
        ilPayment("t1", "2026-05-10T09:00", 200),
        ilPayment("unknown", "2026-05-10T10:00", 999),
      ],
      monthStartUtc: MAY_START_UTC,
      monthEndUtc: MAY_END_UTC,
    });
    expect(result.therapists[0].totalPaidIls).toBe(200);
  });

  it("accepts ISO string paidAt (post JSON.parse(JSON.stringify(...)))", () => {
    const result = computeMonthlyRevenueReport({
      therapists: [THERAPISTS[0]],
      orgDefaultPct: 50,
      payments: [
        {
          therapistId: "t1",
          paidAt: "2026-05-10T09:00:00+03:00",
          amount: 250,
        },
      ],
      monthStartUtc: MAY_START_UTC,
      monthEndUtc: MAY_END_UTC,
    });
    expect(result.therapists[0].totalPaidIls).toBe(250);
  });
});

describe("computeMonthlyRevenueReport — totals", () => {
  it("aggregates totals across all therapists with correct revenue split", () => {
    const result = computeMonthlyRevenueReport({
      therapists: THERAPISTS,
      orgDefaultPct: 50,
      payments: [
        ilPayment("t1", "2026-05-05T09:00", 1000),
        ilPayment("t2", "2026-05-06T09:00", 500),
        ilPayment("t3", "2026-05-07T09:00", 200),
      ],
      monthStartUtc: MAY_START_UTC,
      monthEndUtc: MAY_END_UTC,
    });
    expect(result.totals.paidSessions).toBe(3);
    expect(result.totals.totalPaidIls).toBe(1700);
    // t1 70% של 1000 = 700, t2 50% של 500 = 250 (org default), t3 100% של 200 = 200
    expect(result.totals.therapistRevenueIls).toBe(700 + 250 + 200);
    expect(result.totals.clinicRevenueIls).toBe(1700 - (700 + 250 + 200));
  });

  it("rounds to 2 decimals consistently (no floating-point drift)", () => {
    const result = computeMonthlyRevenueReport({
      therapists: [{ ...THERAPISTS[0], revenueSharePct: 33.33 }],
      orgDefaultPct: null,
      payments: [ilPayment("t1", "2026-05-10T09:00", 100)],
      monthStartUtc: MAY_START_UTC,
      monthEndUtc: MAY_END_UTC,
    });
    const t1 = result.therapists[0];
    expect(t1.sharePct).toBe(33.33);
    expect(t1.therapistRevenueIls).toBe(33.33);
    expect(t1.clinicRevenueIls).toBe(66.67);
  });
});

describe("sortByRevenue", () => {
  it("places higher totalPaidIls first", () => {
    const result = computeMonthlyRevenueReport({
      therapists: THERAPISTS,
      orgDefaultPct: 50,
      payments: [
        ilPayment("t1", "2026-05-05T09:00", 100),
        ilPayment("t2", "2026-05-06T09:00", 800),
        ilPayment("t3", "2026-05-07T09:00", 400),
      ],
      monthStartUtc: MAY_START_UTC,
      monthEndUtc: MAY_END_UTC,
    });
    const sorted = sortByRevenue(result.therapists);
    expect(sorted.map((r) => r.therapistId)).toEqual(["t2", "t3", "t1"]);
  });

  it("does not mutate the input array", () => {
    const result = computeMonthlyRevenueReport({
      therapists: THERAPISTS,
      orgDefaultPct: 50,
      payments: [],
      monthStartUtc: MAY_START_UTC,
      monthEndUtc: MAY_END_UTC,
    });
    const orig = [...result.therapists];
    sortByRevenue(result.therapists);
    expect(result.therapists).toEqual(orig);
  });
});

describe("monthRangeIsraelToUtc", () => {
  it("computes May 2026 boundaries correctly (summer/IDT, UTC+3)", () => {
    const { monthStartUtc, monthEndUtc } = monthRangeIsraelToUtc(
      2026,
      5,
      parseIsraelTime
    );
    expect(monthStartUtc.toISOString()).toBe("2026-04-30T21:00:00.000Z");
    expect(monthEndUtc.toISOString()).toBe("2026-05-31T21:00:00.000Z");
  });

  it("computes January 2026 boundaries correctly (winter/IST, UTC+2)", () => {
    const { monthStartUtc, monthEndUtc } = monthRangeIsraelToUtc(
      2026,
      1,
      parseIsraelTime
    );
    expect(monthStartUtc.toISOString()).toBe("2025-12-31T22:00:00.000Z");
    expect(monthEndUtc.toISOString()).toBe("2026-01-31T22:00:00.000Z");
  });

  it("rolls over December to January correctly", () => {
    const { monthStartUtc, monthEndUtc } = monthRangeIsraelToUtc(
      2026,
      12,
      parseIsraelTime
    );
    expect(monthStartUtc.toISOString()).toBe("2026-11-30T22:00:00.000Z");
    expect(monthEndUtc.toISOString()).toBe("2026-12-31T22:00:00.000Z");
  });

  it("throws on invalid month (0)", () => {
    expect(() => monthRangeIsraelToUtc(2026, 0, parseIsraelTime)).toThrow();
  });

  it("throws on invalid month (13)", () => {
    expect(() => monthRangeIsraelToUtc(2026, 13, parseIsraelTime)).toThrow();
  });
});
