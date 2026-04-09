import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatRelativeDate } from "@/lib/notification-utils";

describe("formatRelativeDate — עברית תקינה", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("מחזיר 'עכשיו' עבור פחות מדקה", () => {
    const date = new Date("2026-04-09T11:59:45Z").toISOString();
    expect(formatRelativeDate(date)).toBe("עכשיו");
  });

  it("מחזיר 'לפני דקה' עבור דקה אחת (יחיד)", () => {
    const date = new Date("2026-04-09T11:59:00Z").toISOString();
    expect(formatRelativeDate(date)).toBe("לפני דקה");
  });

  it("מחזיר 'לפני שתי דקות' עבור 2 דקות (זוגי)", () => {
    const date = new Date("2026-04-09T11:58:00Z").toISOString();
    expect(formatRelativeDate(date)).toBe("לפני שתי דקות");
  });

  it("מחזיר 'לפני 5 דקות' עבור 5 דקות (רבים)", () => {
    const date = new Date("2026-04-09T11:55:00Z").toISOString();
    expect(formatRelativeDate(date)).toBe("לפני 5 דקות");
  });

  it("מחזיר 'לפני שעה' עבור שעה אחת (יחיד)", () => {
    const date = new Date("2026-04-09T11:00:00Z").toISOString();
    expect(formatRelativeDate(date)).toBe("לפני שעה");
  });

  it("מחזיר 'לפני שעתיים' עבור 2 שעות (זוגי)", () => {
    const date = new Date("2026-04-09T10:00:00Z").toISOString();
    expect(formatRelativeDate(date)).toBe("לפני שעתיים");
  });

  it("מחזיר 'לפני 5 שעות' עבור 5 שעות (רבים)", () => {
    const date = new Date("2026-04-09T07:00:00Z").toISOString();
    expect(formatRelativeDate(date)).toBe("לפני 5 שעות");
  });

  it("מחזיר 'לפני יום' עבור יום אחד (יחיד)", () => {
    const date = new Date("2026-04-08T12:00:00Z").toISOString();
    expect(formatRelativeDate(date)).toBe("לפני יום");
  });

  it("מחזיר 'לפני יומיים' עבור 2 ימים (זוגי)", () => {
    const date = new Date("2026-04-07T12:00:00Z").toISOString();
    expect(formatRelativeDate(date)).toBe("לפני יומיים");
  });

  it("מחזיר 'לפני 5 ימים' עבור 5 ימים (רבים)", () => {
    const date = new Date("2026-04-04T12:00:00Z").toISOString();
    expect(formatRelativeDate(date)).toBe("לפני 5 ימים");
  });

  it("מחזיר תאריך מלא עבור 7+ ימים", () => {
    const date = new Date("2026-03-30T12:00:00Z").toISOString();
    const result = formatRelativeDate(date);
    // toLocaleDateString("he-IL") — מחזיר תאריך בעברית
    expect(result).not.toContain("לפני");
    expect(result).toMatch(/\d/); // מכיל ספרות
  });
});
