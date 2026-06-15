/**
 * שלב 2 (חדרים) — ולידציית קלט ל-API החדרים ולשדה roomId בפגישה.
 * בודק את ה-contract של createRoomSchema / updateRoomSchema, ואת התוספת
 * roomId ל-createSessionSchema (אופציונלי, trim, caps).
 */
import { describe, it, expect } from "vitest";
import { createRoomSchema, updateRoomSchema } from "../clinic-room";
import { createSessionSchema } from "../session";

describe("createRoomSchema", () => {
  it("מקבל שם תקין (sortOrder אופציונלי)", () => {
    const r = createRoomSchema.safeParse({ name: "חדר 1" });
    expect(r.success).toBe(true);
  });

  it("מקבל שם + sortOrder", () => {
    expect(createRoomSchema.safeParse({ name: "חדר שקט", sortOrder: 3 }).success).toBe(true);
  });

  it("גוזם רווחים מהשם (trim)", () => {
    const r = createRoomSchema.safeParse({ name: "  חדר 2  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("חדר 2");
  });

  it("דוחה שם ריק", () => {
    expect(createRoomSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("דוחה שם של רווחים בלבד (trim → ריק)", () => {
    expect(createRoomSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("דוחה שם ארוך מ-100 תווים", () => {
    expect(createRoomSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });

  it("דוחה sortOrder שלילי / לא-שלם", () => {
    expect(createRoomSchema.safeParse({ name: "חדר", sortOrder: -1 }).success).toBe(false);
    expect(createRoomSchema.safeParse({ name: "חדר", sortOrder: 1.5 }).success).toBe(false);
  });
});

describe("updateRoomSchema", () => {
  it("דוחה body ריק (refine — חייב שדה אחד לפחות)", () => {
    expect(updateRoomSchema.safeParse({}).success).toBe(false);
  });

  it("מקבל עדכון שם בלבד", () => {
    expect(updateRoomSchema.safeParse({ name: "חדר חדש" }).success).toBe(true);
  });

  it("מקבל השבתה בלבד (isActive=false)", () => {
    expect(updateRoomSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("מקבל sortOrder בלבד", () => {
    expect(updateRoomSchema.safeParse({ sortOrder: 0 }).success).toBe(true);
  });

  it("דוחה שם ריק בעדכון", () => {
    expect(updateRoomSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("createSessionSchema — roomId (שלב 2)", () => {
  const base = {
    clientId: "c1",
    startTime: "2026-06-15T10:00",
    endTime: "2026-06-15T10:50",
  };

  it("פגישה ללא roomId — תקין (אופציונלי, תאימות לאחור)", () => {
    const r = createSessionSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.roomId).toBeUndefined();
  });

  it("פגישה עם roomId תקין", () => {
    const r = createSessionSchema.safeParse({ ...base, roomId: "room_abc" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.roomId).toBe("room_abc");
  });

  it("דוחה roomId של רווחים בלבד (trim → ריק → min(1))", () => {
    expect(createSessionSchema.safeParse({ ...base, roomId: "   " }).success).toBe(false);
  });

  it("דוחה roomId ארוך מ-64 תווים", () => {
    expect(createSessionSchema.safeParse({ ...base, roomId: "x".repeat(65) }).success).toBe(false);
  });
});
