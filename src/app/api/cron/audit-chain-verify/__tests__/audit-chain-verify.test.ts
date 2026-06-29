/**
 * Unit tests — GET /api/cron/audit-chain-verify (H4 tamper-evident audit)
 *
 * מתמקד בלוגיקה שאפשר לבדוק בלי DB: התנהגות ההתראה.
 *   - שרשרת תקינה → אין AdminAlert.
 *   - שרשרת שבורה → AdminAlert URGENT (כשאין כבר אחת פתוחה).
 *   - שרשרת שבורה + התראה קיימת → אין כפילות (dedupe).
 *   - לא-מאותחל (טרם נפרס) → אין התראה.
 *   - guard נכשל → מוחזר מיד בלי אימות.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const checkCronAuthMock = vi.fn();
const verifyAllAuditChainsMock = vi.fn();
const adminAlertFindFirst = vi.fn();
const adminAlertCreate = vi.fn();

vi.mock("@/lib/cron-auth", () => ({
  checkCronAuth: (...a: unknown[]) => checkCronAuthMock(...a),
}));

vi.mock("@/lib/audit-chain", () => ({
  verifyAllAuditChains: (...a: unknown[]) => verifyAllAuditChainsMock(...a),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    adminAlert: {
      findFirst: (...a: unknown[]) => adminAlertFindFirst(...a),
      create: (...a: unknown[]) => adminAlertCreate(...a),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET } from "../route";

function makeReq() {
  return new Request("https://test.local/api/cron/audit-chain-verify") as unknown as import("next/server").NextRequest;
}

const okChain = (table: string) => ({
  table,
  initialized: true,
  chainedRows: 5,
  tailMatchesHead: true,
  breaks: [],
  ok: true,
});

const brokenChain = (table: string) => ({
  table,
  initialized: true,
  chainedRows: 5,
  tailMatchesHead: false,
  breaks: [{ seq: "3", reason: "row_hash_mismatch" }],
  ok: false,
});

beforeEach(() => {
  vi.resetAllMocks();
  checkCronAuthMock.mockResolvedValue(null); // עובר
  adminAlertFindFirst.mockResolvedValue(null);
  adminAlertCreate.mockResolvedValue({ id: "alert-1" });
});

describe("GET /api/cron/audit-chain-verify", () => {
  it("returns the guard response when cron auth fails", async () => {
    const guard = new Response("unauthorized", { status: 401 });
    checkCronAuthMock.mockResolvedValue(guard);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(verifyAllAuditChainsMock).not.toHaveBeenCalled();
  });

  it("does NOT create an alert when all chains are intact", async () => {
    verifyAllAuditChainsMock.mockResolvedValue([okChain("admin"), okChain("dataaccess")]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.broken).toBe(0);
    expect(adminAlertCreate).not.toHaveBeenCalled();
  });

  it("creates a URGENT alert when a chain is broken", async () => {
    verifyAllAuditChainsMock.mockResolvedValue([brokenChain("admin"), okChain("dataaccess")]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(adminAlertCreate).toHaveBeenCalledTimes(1);
    const call = adminAlertCreate.mock.calls[0][0] as { data: { priority: string; type: string } };
    expect(call.data.priority).toBe("URGENT");
    expect(call.data.type).toBe("SYSTEM");
  });

  it("does NOT duplicate the alert when one is already PENDING (dedupe)", async () => {
    verifyAllAuditChainsMock.mockResolvedValue([brokenChain("admin")]);
    adminAlertFindFirst.mockResolvedValue({ id: "existing-alert" });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(adminAlertCreate).not.toHaveBeenCalled();
  });

  it("does NOT alert when the chain is not yet deployed (initialized=false)", async () => {
    verifyAllAuditChainsMock.mockResolvedValue([
      { table: "admin", initialized: false, chainedRows: 0, tailMatchesHead: true, breaks: [], ok: true },
      { table: "dataaccess", initialized: false, chainedRows: 0, tailMatchesHead: true, breaks: [], ok: true },
    ]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.broken).toBe(0);
    expect(adminAlertCreate).not.toHaveBeenCalled();
  });
});
