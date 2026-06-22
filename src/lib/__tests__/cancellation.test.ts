import { describe, it, expect } from "vitest";
import { shouldChargeCancellation, hoursUntil } from "../cancellation";

describe("shouldChargeCancellation", () => {
  it("מחייב כשהביטול בתוך החלון ויש מחיר", () => {
    expect(shouldChargeCancellation(5, 24, 200)).toBe(true);
    expect(shouldChargeCancellation(23.9, 24, 200)).toBe(true);
  });

  it("לא מחייב כשנותר זמן רב מהסף", () => {
    expect(shouldChargeCancellation(48, 24, 200)).toBe(false);
    expect(shouldChargeCancellation(25, 24, 200)).toBe(false);
  });

  it("בדיוק על הסף — לא מחייב (גבול)", () => {
    expect(shouldChargeCancellation(24, 24, 200)).toBe(false);
  });

  it("מחיר 0 — אף פעם לא מחייב, גם בתוך החלון", () => {
    expect(shouldChargeCancellation(1, 24, 0)).toBe(false);
    expect(shouldChargeCancellation(0.5, 48, 0)).toBe(false);
  });

  it("מחיר שלילי — לא מחייב", () => {
    expect(shouldChargeCancellation(1, 24, -50)).toBe(false);
  });

  it("מכבד סף מותאם של הקליניקה (48 שעות)", () => {
    expect(shouldChargeCancellation(40, 48, 200)).toBe(true);
    expect(shouldChargeCancellation(49, 48, 200)).toBe(false);
  });

  it("פגישה שכבר עברה (שעות שליליות) — נחשבת בתוך החלון", () => {
    expect(shouldChargeCancellation(-2, 24, 200)).toBe(true);
  });
});

describe("hoursUntil", () => {
  const now = new Date("2026-06-22T12:00:00.000Z");

  it("מחשב שעות עד פגישה עתידית", () => {
    expect(hoursUntil(new Date("2026-06-22T18:00:00.000Z"), now)).toBe(6);
  });

  it("מחזיר שלילי לפגישה שעברה", () => {
    expect(hoursUntil(new Date("2026-06-22T09:00:00.000Z"), now)).toBe(-3);
  });

  it("מקבל גם מחרוזת ISO", () => {
    expect(hoursUntil("2026-06-23T12:00:00.000Z", now)).toBe(24);
  });
});
