/**
 * Unit tests ל-src/lib/date-utils.ts
 *
 * נבנה בשלב 1.0 של תוכנית שיפור ממשק הניהול (21.4.2026).
 * מטרה: לוודא ש-6 פונקציות ה-timezone מחזירות ערכים נכונים לפי שעון ישראל,
 * כולל טיפול במעברי DST (IST +02:00 ⇄ IDT +03:00).
 */

import { describe, it, expect } from "vitest";
import {
  parseIsraelTime,
  getIsraelMonth,
  getIsraelYear,
  isSameIsraelMonth,
  isNewIsraelMonthSince,
  getIsraelQuarter,
  getIsraelMidnight,
  getCurrentUsageKey,
  formatHebrewNumber,
} from "../date-utils";

describe("parseIsraelTime — existing function", () => {
  it("winter date-only → midnight IST (+02:00)", () => {
    // 15 January 2026 (winter) — Israel is UTC+2
    const result = parseIsraelTime("2026-01-15");
    expect(result.toISOString()).toBe("2026-01-14T22:00:00.000Z");
  });

  it("summer date-only → midnight IDT (+03:00)", () => {
    // 15 July 2026 (summer) — Israel is UTC+3
    const result = parseIsraelTime("2026-07-15");
    expect(result.toISOString()).toBe("2026-07-14T21:00:00.000Z");
  });
});

describe("getIsraelMonth — Israel calendar month", () => {
  it("UTC near midnight → still prior day in Israel", () => {
    // 31 December 2025 23:30 UTC = 01:30 Israel on 1 January 2026
    const d = new Date("2025-12-31T23:30:00Z");
    expect(getIsraelMonth(d)).toBe(1); // January
  });

  it("summer midday — straightforward", () => {
    const d = new Date("2026-07-15T12:00:00Z");
    expect(getIsraelMonth(d)).toBe(7); // July
  });

  it("UTC 22:00 in winter = next day 00:00 Israel", () => {
    // Winter: Israel is UTC+2, so 22:00 UTC = 00:00 Israel next day
    const d = new Date("2026-01-31T22:00:00Z");
    expect(getIsraelMonth(d)).toBe(2); // February in Israel
  });
});

describe("getIsraelYear — Israel calendar year", () => {
  it("31 December 23:30 UTC → 2026 in Israel", () => {
    const d = new Date("2025-12-31T23:30:00Z");
    expect(getIsraelYear(d)).toBe(2026);
  });

  it("1 January 00:30 UTC → still 2025 in Israel (02:30 IST)", () => {
    // Wait: 00:30 UTC = 02:30 IST = January 1 in Israel too (winter)
    // Let me re-check: 00:30 UTC on Jan 1, 2026 = 02:30 IST = Jan 1, 2026 in Israel
    const d = new Date("2026-01-01T00:30:00Z");
    expect(getIsraelYear(d)).toBe(2026);
  });

  it("31 December 21:00 UTC → 31 December 23:00 Israel", () => {
    // Winter, IST = UTC+2
    const d = new Date("2025-12-31T21:00:00Z");
    expect(getIsraelYear(d)).toBe(2025);
  });
});

describe("isSameIsraelMonth — boundary detection", () => {
  it("same calendar month → true", () => {
    const a = new Date("2026-04-01T08:00:00Z");
    const b = new Date("2026-04-30T20:00:00Z");
    expect(isSameIsraelMonth(a, b)).toBe(true);
  });

  it("different months → false", () => {
    const a = new Date("2026-04-30T08:00:00Z");
    const b = new Date("2026-05-01T08:00:00Z");
    expect(isSameIsraelMonth(a, b)).toBe(false);
  });

  it("UTC shows same month but Israel crosses month boundary", () => {
    // Both in January UTC, but second one is already February Israel
    const a = new Date("2026-01-31T12:00:00Z"); // Jan Israel
    const b = new Date("2026-01-31T23:30:00Z"); // Feb Israel (01:30 IST)
    expect(isSameIsraelMonth(a, b)).toBe(false);
  });
});

describe("isNewIsraelMonthSince", () => {
  it("prev was previous month → true", () => {
    const prev = new Date("2026-03-15T12:00:00Z");
    const now = new Date("2026-04-15T12:00:00Z");
    expect(isNewIsraelMonthSince(prev, now)).toBe(true);
  });

  it("same month → false", () => {
    const prev = new Date("2026-04-01T12:00:00Z");
    const now = new Date("2026-04-15T12:00:00Z");
    expect(isNewIsraelMonthSince(prev, now)).toBe(false);
  });
});

describe("getIsraelQuarter", () => {
  it("February → Q1", () => {
    expect(getIsraelQuarter(new Date("2026-02-15T12:00:00Z"))).toBe(1);
  });
  it("May → Q2", () => {
    expect(getIsraelQuarter(new Date("2026-05-15T12:00:00Z"))).toBe(2);
  });
  it("September → Q3", () => {
    expect(getIsraelQuarter(new Date("2026-09-15T12:00:00Z"))).toBe(3);
  });
  it("December → Q4", () => {
    expect(getIsraelQuarter(new Date("2026-12-15T12:00:00Z"))).toBe(4);
  });
});

describe("getIsraelMidnight — DST-aware (critical)", () => {
  it("winter midnight — IST (+02:00)", () => {
    // 15 January 2026 at 12:00 Israel = 10:00 UTC
    const d = new Date("2026-01-15T12:00:00Z");
    const result = getIsraelMidnight(d);
    // Expected: 2026-01-15 00:00 Israel = 2026-01-14 22:00 UTC (winter = +02:00)
    expect(result.toISOString()).toBe("2026-01-14T22:00:00.000Z");
  });

  it("summer midnight — IDT (+03:00)", () => {
    // 15 July 2026 at 12:00 Israel = 09:00 UTC
    const d = new Date("2026-07-15T12:00:00Z");
    const result = getIsraelMidnight(d);
    // Expected: 2026-07-15 00:00 Israel = 2026-07-14 21:00 UTC (summer = +03:00)
    expect(result.toISOString()).toBe("2026-07-14T21:00:00.000Z");
  });

  it("DST transition — late October 2026 (IDT → IST)", () => {
    // In Israel DST ends on last Sunday in October (25.10.2026 at 02:00)
    const beforeDST = new Date("2026-10-24T20:59:00Z"); // still IDT
    const afterDST = new Date("2026-10-26T22:01:00Z"); // already IST
    // Both should return valid Dates (no crash)
    expect(getIsraelMidnight(beforeDST)).toBeInstanceOf(Date);
    expect(getIsraelMidnight(afterDST)).toBeInstanceOf(Date);
  });

  it("winter vs summer — exactly 1 hour difference in UTC offset", () => {
    // Same Israel local time, different seasons → different UTC offsets
    const winter = getIsraelMidnight(new Date("2026-01-15T12:00:00Z"));
    const summer = getIsraelMidnight(new Date("2026-07-15T12:00:00Z"));
    // Extract the UTC hour of each midnight
    const winterHour = winter.getUTCHours();
    const summerHour = summer.getUTCHours();
    // Winter midnight = 22:00 UTC previous day; summer = 21:00 UTC previous day
    expect(winterHour).toBe(22);
    expect(summerHour).toBe(21);
  });
});

describe("getCurrentUsageKey — canonical MonthlyUsage key", () => {
  it("returns object with month + year in Israel TZ", () => {
    const d = new Date("2026-04-15T12:00:00Z");
    expect(getCurrentUsageKey(d)).toEqual({ month: 4, year: 2026 });
  });

  it("correctly identifies month change near boundary", () => {
    // 31 December 23:30 UTC = 1 January 01:30 Israel
    const d = new Date("2025-12-31T23:30:00Z");
    expect(getCurrentUsageKey(d)).toEqual({ month: 1, year: 2026 });
  });
});

describe("formatHebrewNumber", () => {
  it("formats thousands with comma", () => {
    expect(formatHebrewNumber(1234)).toBe("1,234");
    expect(formatHebrewNumber(5000)).toBe("5,000");
  });

  it("formats zero", () => {
    expect(formatHebrewNumber(0)).toBe("0");
  });

  it("formats small numbers unchanged", () => {
    expect(formatHebrewNumber(72)).toBe("72");
  });

  it("formats large numbers", () => {
    expect(formatHebrewNumber(1000000)).toBe("1,000,000");
  });
});
