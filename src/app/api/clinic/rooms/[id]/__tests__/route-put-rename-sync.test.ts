/**
 * Unit tests — PUT /api/clinic/rooms/[id], סנכרון location בשינוי שם חדר (שלב 2).
 *
 * הנקודה הקריטית: location בפגישה הוא snapshot של שם החדר בעת היצירה. בשינוי שם
 * החדר, חייבים לסנכרן את location בכל הפגישות המשויכות (roomId) — אחרת תזכורות
 * מייל והודעות חפיפה יציגו שם ישן. roomId נשאר מקור-האמת. שינוי שאינו-שם
 * (isActive/sortOrder) או שינוי לאותו שם — לא מסנכרן (אין צורך).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const requireClinicOwner = vi.fn();
const roomFindUnique = vi.fn();
const roomFindFirst = vi.fn();
const roomUpdateMany = vi.fn();
const sessionUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    clinicRoom: {
      findUnique: (...a: unknown[]) => roomFindUnique(...a),
      findFirst: (...a: unknown[]) => roomFindFirst(...a),
      updateMany: (...a: unknown[]) => roomUpdateMany(...a),
    },
    therapySession: {
      updateMany: (...a: unknown[]) => sessionUpdateMany(...a),
    },
  },
}));
vi.mock("@/lib/clinic/require-clinic-owner", () => ({
  requireClinicOwner: (...a: unknown[]) => requireClinicOwner(...a),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { PUT } from "../route";

async function callPUT(body: unknown): Promise<Response> {
  const req = new Request("https://test.local/api/clinic/rooms/room-1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
  const r = await PUT(req, { params: Promise.resolve({ id: "room-1" }) });
  if (!r) throw new Error("PUT returned undefined");
  return r as Response;
}

beforeEach(() => {
  vi.resetAllMocks();
  requireClinicOwner.mockResolvedValue({
    userId: "owner-1",
    session: {},
    organizationId: "org-1",
    name: "בעלים",
  });
  roomFindUnique.mockResolvedValue({
    id: "room-1",
    organizationId: "org-1",
    name: "חדר ישן",
    isActive: true,
    sortOrder: 0,
  });
  roomFindFirst.mockResolvedValue(null); // אין כפילות שם
  roomUpdateMany.mockResolvedValue({ count: 1 });
  sessionUpdateMany.mockResolvedValue({ count: 3 });
});

describe("PUT /api/clinic/rooms/[id] — עקביות שם חדר", () => {
  it("שינוי שם — מסנכרן location בכל הפגישות של החדר", async () => {
    const res = await callPUT({ name: "חדר חדש" });
    expect(res.status).toBe(200);
    expect(sessionUpdateMany).toHaveBeenCalledTimes(1);
    expect(sessionUpdateMany.mock.calls[0][0]).toEqual({
      where: { roomId: "room-1", organizationId: "org-1" },
      data: { location: "חדר חדש" },
    });
  });

  it("שינוי שאינו-שם (isActive בלבד) — לא מסנכרן location", async () => {
    const res = await callPUT({ isActive: false });
    expect(res.status).toBe(200);
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });

  it("שינוי לאותו שם — לא מסנכרן (אין שינוי בפועל)", async () => {
    const res = await callPUT({ name: "חדר ישן" });
    expect(res.status).toBe(200);
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });

  it("כשל סנכרון location לא מפיל את עדכון החדר — עדיין 200", async () => {
    sessionUpdateMany.mockRejectedValue(new Error("db down"));
    const res = await callPUT({ name: "חדר חדש" });
    expect(res.status).toBe(200);
  });
});
