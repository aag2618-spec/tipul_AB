import { describe, it, expect, beforeEach, vi } from "vitest";

// M11.G3 (קומיט B): unit tests עם mock ל-Prisma. בודקים את חוקי ה-fallback,
// skip לעצמאיים, סינון לפי PAID, וחישוב סכומים. אין כאן קריאות DB אמיתיות.

const findUniqueMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    therapySession: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
      update: (...a: unknown[]) => updateMock(...a),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { applyRevenueShareSnapshot } from "../revenue-snapshot";

beforeEach(() => {
  findUniqueMock.mockReset();
  updateMock.mockReset();
  updateMock.mockResolvedValue({});
});

describe("applyRevenueShareSnapshot — skip rules", () => {
  it("skips when sessionId is null/undefined/empty", async () => {
    await applyRevenueShareSnapshot({ sessionId: null });
    await applyRevenueShareSnapshot({ sessionId: undefined });
    await applyRevenueShareSnapshot({ sessionId: "" });
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("skips when session is not found in DB", async () => {
    findUniqueMock.mockResolvedValue(null);
    await applyRevenueShareSnapshot({ sessionId: "ghost" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("skips for independent therapist (organizationId=null) — CRITICAL", async () => {
    // דרישת HANDOFF: מטפלים עצמאיים — התנהגות זהה לחלוטין, אסור שום שינוי.
    findUniqueMock.mockResolvedValue({
      id: "s1",
      organizationId: null,
      therapist: { revenueSharePct: 80 },
      organization: null,
      payment: {
        status: "PAID",
        amount: 500,
        childPayments: [],
      },
    });
    await applyRevenueShareSnapshot({ sessionId: "s1" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("skips when there is no Payment on the session", async () => {
    findUniqueMock.mockResolvedValue({
      id: "s1",
      organizationId: "org1",
      therapist: { revenueSharePct: 70 },
      organization: { defaultRevenueSharePct: 50 },
      payment: null,
    });
    await applyRevenueShareSnapshot({ sessionId: "s1" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("skips when totalPaid is 0 (parent PENDING + no PAID children)", async () => {
    findUniqueMock.mockResolvedValue({
      id: "s1",
      organizationId: "org1",
      therapist: { revenueSharePct: 70 },
      organization: { defaultRevenueSharePct: 50 },
      payment: {
        status: "PENDING",
        amount: 0,
        childPayments: [
          { status: "PENDING", amount: 100 },
        ],
      },
    });
    await applyRevenueShareSnapshot({ sessionId: "s1" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("does not throw on Prisma errors (logs and returns)", async () => {
    findUniqueMock.mockRejectedValue(new Error("DB unavailable"));
    await expect(
      applyRevenueShareSnapshot({ sessionId: "s1" })
    ).resolves.toBeUndefined();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("applyRevenueShareSnapshot — fallback chain", () => {
  it("uses User.revenueSharePct when set", async () => {
    findUniqueMock.mockResolvedValue({
      id: "s1",
      organizationId: "org1",
      therapist: { revenueSharePct: 70 },
      organization: { defaultRevenueSharePct: 50 },
      payment: {
        status: "PAID",
        amount: 1000,
        childPayments: [],
      },
    });
    await applyRevenueShareSnapshot({ sessionId: "s1" });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { therapistRevenueIls: 700 },
    });
  });

  it("falls back to Organization.defaultRevenueSharePct when user is null", async () => {
    findUniqueMock.mockResolvedValue({
      id: "s1",
      organizationId: "org1",
      therapist: { revenueSharePct: null },
      organization: { defaultRevenueSharePct: 60 },
      payment: {
        status: "PAID",
        amount: 1000,
        childPayments: [],
      },
    });
    await applyRevenueShareSnapshot({ sessionId: "s1" });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { therapistRevenueIls: 600 },
    });
  });

  it("falls back to 100% when both user and org are null", async () => {
    findUniqueMock.mockResolvedValue({
      id: "s1",
      organizationId: "org1",
      therapist: { revenueSharePct: null },
      organization: { defaultRevenueSharePct: null },
      payment: {
        status: "PAID",
        amount: 250,
        childPayments: [],
      },
    });
    await applyRevenueShareSnapshot({ sessionId: "s1" });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { therapistRevenueIls: 250 },
    });
  });
});

describe("applyRevenueShareSnapshot — totalPaid computation", () => {
  it("uses parent.amount when there are no children and parent is PAID", async () => {
    findUniqueMock.mockResolvedValue({
      id: "s1",
      organizationId: "org1",
      therapist: { revenueSharePct: 50 },
      organization: { defaultRevenueSharePct: null },
      payment: {
        status: "PAID",
        amount: 800,
        childPayments: [],
      },
    });
    await applyRevenueShareSnapshot({ sessionId: "s1" });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { therapistRevenueIls: 400 },
    });
  });

  it("sums only PAID children when children are present (ignores parent.amount)", async () => {
    findUniqueMock.mockResolvedValue({
      id: "s1",
      organizationId: "org1",
      therapist: { revenueSharePct: 50 },
      organization: { defaultRevenueSharePct: null },
      payment: {
        status: "PAID",
        amount: 999,
        childPayments: [
          { status: "PAID", amount: 100 },
          { status: "PAID", amount: 200 },
          { status: "PENDING", amount: 700 },
        ],
      },
    });
    await applyRevenueShareSnapshot({ sessionId: "s1" });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { therapistRevenueIls: 150 },
    });
  });

  it("snapshots even when parent is PENDING but children include PAID amounts", async () => {
    findUniqueMock.mockResolvedValue({
      id: "s1",
      organizationId: "org1",
      therapist: { revenueSharePct: 100 },
      organization: { defaultRevenueSharePct: null },
      payment: {
        status: "PENDING",
        amount: 100,
        childPayments: [{ status: "PAID", amount: 100 }],
      },
    });
    await applyRevenueShareSnapshot({ sessionId: "s1" });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { therapistRevenueIls: 100 },
    });
  });

  it("rounds to 2 decimal places", async () => {
    findUniqueMock.mockResolvedValue({
      id: "s1",
      organizationId: "org1",
      therapist: { revenueSharePct: 33.33 },
      organization: { defaultRevenueSharePct: null },
      payment: {
        status: "PAID",
        amount: 100,
        childPayments: [],
      },
    });
    await applyRevenueShareSnapshot({ sessionId: "s1" });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { therapistRevenueIls: 33.33 },
    });
  });
});
