import { describe, it, expect } from "vitest";
import {
  monthYearOf,
  isOverQuota,
  calcRemaining,
} from "@/lib/clinic/sms-quota";

describe("monthYearOf", () => {
  it("extracts month (1-12) and year from Date", () => {
    expect(monthYearOf(new Date("2026-05-15T10:00:00"))).toEqual({
      month: 5,
      year: 2026,
    });
    expect(monthYearOf(new Date("2026-01-01T00:00:00"))).toEqual({
      month: 1,
      year: 2026,
    });
    expect(monthYearOf(new Date("2026-12-31T23:59:59"))).toEqual({
      month: 12,
      year: 2026,
    });
  });

  it("handles year boundary", () => {
    expect(monthYearOf(new Date("2027-01-01T00:00:00"))).toEqual({
      month: 1,
      year: 2027,
    });
  });
});

describe("isOverQuota", () => {
  it("returns false when under quota", () => {
    expect(isOverQuota(0, 500)).toBe(false);
    expect(isOverQuota(100, 500)).toBe(false);
    expect(isOverQuota(499, 500)).toBe(false);
  });

  it("returns true at quota boundary", () => {
    expect(isOverQuota(500, 500)).toBe(true);
  });

  it("returns true when over quota", () => {
    expect(isOverQuota(501, 500)).toBe(true);
    expect(isOverQuota(1000, 500)).toBe(true);
  });

  it("zero quota — always over (no allowance)", () => {
    expect(isOverQuota(0, 0)).toBe(true);
    expect(isOverQuota(1, 0)).toBe(true);
  });
});

describe("calcRemaining", () => {
  it("returns positive remaining", () => {
    expect(calcRemaining(0, 500)).toBe(500);
    expect(calcRemaining(100, 500)).toBe(400);
    expect(calcRemaining(499, 500)).toBe(1);
  });

  it("returns 0 at quota", () => {
    expect(calcRemaining(500, 500)).toBe(0);
  });

  it("returns 0 (not negative) when over quota", () => {
    expect(calcRemaining(501, 500)).toBe(0);
    expect(calcRemaining(1000, 500)).toBe(0);
  });

  it("zero quota → 0 remaining", () => {
    expect(calcRemaining(0, 0)).toBe(0);
    expect(calcRemaining(5, 0)).toBe(0);
  });
});
