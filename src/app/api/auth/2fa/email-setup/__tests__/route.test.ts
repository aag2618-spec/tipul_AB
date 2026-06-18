/**
 * Unit tests — /api/auth/2fa/email-setup: הפעלה/כיבוי 2FA במייל/SMS (OTP).
 *
 * נועד למשתמשים בלי סמארטפון עם סורק QR. POST שולח קוד, PATCH מפעיל (method=OTP),
 * DELETE מכבה. כל פעולה דורשת קוד שנשלח לערוץ של המשתמש.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";

const requireAuth = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const sendCode = vi.fn();
const confirmCode = vi.fn();
const invalidateJwtCache = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
  },
}));
vi.mock("@/lib/api-auth", () => ({ requireAuth: (...a: unknown[]) => requireAuth(...a) }));
vi.mock("@/lib/two-factor", () => ({
  sendCode: (...a: unknown[]) => sendCode(...a),
  confirmTwoFactorCodeForSetup: (...a: unknown[]) => confirmCode(...a),
}));
vi.mock("@/lib/auth", () => ({ invalidateJwtCache: (...a: unknown[]) => invalidateJwtCache(...a) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST, PATCH, DELETE } from "../route";

type NReq = import("next/server").NextRequest;
function jsonReq(method: string, body?: unknown): NReq {
  return new Request("https://test.local/api/auth/2fa/email-setup", {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as unknown as NReq;
}

// ה-handlers מטופסים כ-Response | undefined (כמו כל ה-routes בקודבייס); guard.
async function run(p: Promise<Response | undefined> | Response | undefined): Promise<Response> {
  const r = await p;
  if (!r) throw new Error("handler returned undefined");
  return r;
}

beforeEach(() => {
  vi.resetAllMocks();
  requireAuth.mockResolvedValue({ userId: "u1" });
  userFindUnique.mockResolvedValue({
    id: "u1",
    email: "test@example.com",
    phone: "0501234567",
    name: "מטופל",
    twoFactorEnabled: true,
    twoFactorMethod: "OTP",
  });
  userUpdate.mockResolvedValue({});
  sendCode.mockResolvedValue({ success: true });
  confirmCode.mockResolvedValue(true);
});

describe("POST /api/auth/2fa/email-setup — שליחת קוד", () => {
  it("שולח קוד ומחזיר success", async () => {
    const res = await run(POST());
    expect(res.status).toBe(200);
    expect(sendCode).toHaveBeenCalledTimes(1);
  });

  it("ללא כתובת מייל → 400, לא שולח", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", email: null });
    const res = await run(POST());
    expect(res.status).toBe(400);
    expect(sendCode).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/auth/2fa/email-setup — הפעלה", () => {
  it("קוד תקין → מפעיל 2FA עם method=OTP + מנקה JWT cache", async () => {
    const res = await run(PATCH(jsonReq("PATCH", { code: "123456" })));
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledTimes(1);
    const arg = userUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.twoFactorEnabled).toBe(true);
    expect(arg.data.twoFactorMethod).toBe("OTP");
    expect(invalidateJwtCache).toHaveBeenCalledWith("u1");
  });

  it("קוד שגוי → 400, לא משנה את ה-DB", async () => {
    confirmCode.mockResolvedValue(false);
    const res = await run(PATCH(jsonReq("PATCH", { code: "000000" })));
    expect(res.status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("בלי קוד → 400, לא מאמת בכלל", async () => {
    const res = await run(PATCH(jsonReq("PATCH", {})));
    expect(res.status).toBe(400);
    expect(confirmCode).not.toHaveBeenCalled();
  });
});

describe("הגנת impersonation (disallowImpersonation)", () => {
  it("כש-requireAuth דוחה → מחזיר את ה-error ולא נוגע ב-DB/קוד", async () => {
    requireAuth.mockResolvedValue({
      error: NextResponse.json({ message: "אסור בזמן התחזות" }, { status: 403 }),
    });
    const res = await run(PATCH(jsonReq("PATCH", { code: "123456" })));
    expect(res.status).toBe(403);
    expect(confirmCode).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/auth/2fa/email-setup — כיבוי", () => {
  it("קוד תקין ו-OTP פעיל → מכבה (enabled=false, method=null)", async () => {
    const res = await run(DELETE(jsonReq("DELETE", { code: "123456" })));
    expect(res.status).toBe(200);
    const arg = userUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.twoFactorEnabled).toBe(false);
    expect(arg.data.twoFactorMethod).toBe(null);
  });

  it("כש-TOTP פעיל → 400 (כיבוי TOTP רק בנתיב הייעודי), לא מאמת ולא משנה", async () => {
    userFindUnique.mockResolvedValue({ twoFactorEnabled: true, twoFactorMethod: "TOTP" });
    const res = await run(DELETE(jsonReq("DELETE", { code: "123456" })));
    expect(res.status).toBe(400);
    expect(confirmCode).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
