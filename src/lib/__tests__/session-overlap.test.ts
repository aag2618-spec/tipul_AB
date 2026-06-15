/**
 * שלב 2 (חדרים) — findClinicLocationConflict.
 * מאמת את לוגיקת בדיקת חפיפת החדר: ענף roomId (FK מדויק) מול ענף location
 * (התאמת מחרוזת — תאימות לאחור), ה-guards, ומיפוי התוצאה.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { therapySession: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import prisma from "@/lib/prisma";
import {
  findClinicLocationConflict,
  buildClinicConflictMessage,
} from "@/lib/session-overlap";

const findFirst = (
  prisma as unknown as {
    therapySession: { findFirst: ReturnType<typeof vi.fn> };
  }
).therapySession.findFirst;

const start = new Date("2026-06-15T10:00:00Z");
const end = new Date("2026-06-15T11:00:00Z");

beforeEach(() => {
  findFirst.mockReset();
});

describe("findClinicLocationConflict — guards", () => {
  it("מחזיר null ללא organizationId (מטפל עצמאי) — בלי לפנות ל-DB", async () => {
    const r = await findClinicLocationConflict({
      organizationId: null,
      location: "חדר 1",
      startTime: start,
      endTime: end,
    });
    expect(r).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("מחזיר null כשאין גם roomId וגם location", async () => {
    const r = await findClinicLocationConflict({
      organizationId: "org1",
      location: "",
      startTime: start,
      endTime: end,
    });
    expect(r).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("findClinicLocationConflict — ענף roomId (FK מדויק)", () => {
  it("כשיש roomId — מסנן לפי roomId ולא לפי location", async () => {
    findFirst.mockResolvedValue(null);
    await findClinicLocationConflict({
      organizationId: "org1",
      location: "שם כלשהו",
      roomId: "room_1",
      startTime: start,
      endTime: end,
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
    const where = findFirst.mock.calls[0][0].where;
    expect(where.organizationId).toBe("org1");
    expect(where.roomId).toBe("room_1");
    expect(where.location).toBeUndefined();
  });

  it("כשאין roomId — נופל להתאמת location (case-insensitive)", async () => {
    findFirst.mockResolvedValue(null);
    await findClinicLocationConflict({
      organizationId: "org1",
      location: "חדר 1",
      startTime: start,
      endTime: end,
    });
    const where = findFirst.mock.calls[0][0].where;
    expect(where.location).toEqual({ equals: "חדר 1", mode: "insensitive" });
    expect(where.roomId).toBeUndefined();
  });

  it("excludeSessionId — מוסיף id:{not} ל-where (מסלול עריכה/PUT)", async () => {
    findFirst.mockResolvedValue(null);
    await findClinicLocationConflict({
      organizationId: "org1",
      roomId: "room_1",
      location: null,
      startTime: start,
      endTime: end,
      excludeSessionId: "self1",
    });
    const where = findFirst.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: "self1" });
  });

  it("מחזיר conflict ממופה (שם מטפל + שם לקוח) כשנמצאה חפיפה", async () => {
    findFirst.mockResolvedValue({
      id: "s1",
      startTime: start,
      endTime: end,
      location: "חדר 1",
      type: "IN_PERSON",
      therapist: { name: "כהן" },
      client: { name: "ישראל" },
    });
    const r = await findClinicLocationConflict({
      organizationId: "org1",
      roomId: "room_1",
      location: null,
      startTime: start,
      endTime: end,
    });
    expect(r).not.toBeNull();
    expect(r?.id).toBe("s1");
    expect(r?.therapistName).toBe("כהן");
    expect(r?.clientName).toBe("ישראל");
  });
});

describe("buildClinicConflictMessage", () => {
  it("מרכיב הודעה הכוללת מיקום, שם מטפל ושם לקוח", () => {
    const msg = buildClinicConflictMessage({
      id: "s1",
      startTime: start,
      endTime: end,
      location: "חדר 1",
      therapistName: "כהן",
      clientName: "ישראל",
      type: "IN_PERSON",
    });
    expect(msg).toContain("חדר 1");
    expect(msg).toContain("כהן");
    expect(msg).toContain("ישראל");
  });
});
