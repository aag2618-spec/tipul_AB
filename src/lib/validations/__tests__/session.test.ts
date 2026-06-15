/**
 * patchSessionSchema — שדה topic (נושא הפגישה).
 * מאמת שהוספת topic ל-PATCH תואמת לאחור (skipSummary לבד עדיין עובד),
 * אוכפת אורך מקסימלי (500), ומאפשרת null/ריק (ניקוי נושא).
 */
import { describe, it, expect } from "vitest";
import { patchSessionSchema } from "../session";

describe("patchSessionSchema — topic", () => {
  it("מקבל body עם skipSummary בלבד (תאימות לאחור)", () => {
    expect(patchSessionSchema.safeParse({ skipSummary: true }).success).toBe(true);
  });

  it("מקבל body ריק (כל השדות אופציונליים)", () => {
    expect(patchSessionSchema.safeParse({}).success).toBe(true);
  });

  it("מקבל topic תקין", () => {
    expect(patchSessionSchema.safeParse({ topic: "מעקב חרדה" }).success).toBe(true);
  });

  it("מקבל topic ו-skipSummary יחד", () => {
    expect(
      patchSessionSchema.safeParse({ topic: "שינה", skipSummary: false }).success,
    ).toBe(true);
  });

  it("מקבל topic = null (ניקוי נושא)", () => {
    const r = patchSessionSchema.safeParse({ topic: null });
    expect(r.success).toBe(true);
  });

  it("מקבל topic ריק", () => {
    expect(patchSessionSchema.safeParse({ topic: "" }).success).toBe(true);
  });

  it("מקבל topic באורך 500 בדיוק", () => {
    expect(patchSessionSchema.safeParse({ topic: "x".repeat(500) }).success).toBe(true);
  });

  it("דוחה topic ארוך מ-500 תווים", () => {
    expect(patchSessionSchema.safeParse({ topic: "x".repeat(501) }).success).toBe(false);
  });

  it("דוחה topic שאינו מחרוזת", () => {
    expect(patchSessionSchema.safeParse({ topic: 123 }).success).toBe(false);
  });
});
