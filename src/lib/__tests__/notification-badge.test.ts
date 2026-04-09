import { describe, it, expect } from "vitest";
import { formatBadgeCount } from "@/lib/notification-utils";

describe("formatBadgeCount — תצוגת באדג' פעמון", () => {
  it("מחזיר null כש-0 התראות (באדג' מוסתר)", () => {
    expect(formatBadgeCount(0)).toBeNull();
  });

  it("מחזיר null עבור מספר שלילי", () => {
    expect(formatBadgeCount(-1)).toBeNull();
  });

  it("מחזיר '1' עבור התראה אחת", () => {
    expect(formatBadgeCount(1)).toBe("1");
  });

  it("מחזיר '9' עבור 9 התראות", () => {
    expect(formatBadgeCount(9)).toBe("9");
  });

  it("מחזיר '9+' עבור 10 התראות", () => {
    expect(formatBadgeCount(10)).toBe("9+");
  });

  it("מחזיר '9+' עבור 100 התראות", () => {
    expect(formatBadgeCount(100)).toBe("9+");
  });
});
