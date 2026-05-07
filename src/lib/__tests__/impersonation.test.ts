/**
 * Unit tests — src/lib/impersonation.ts
 *
 * הטסטים האלה מבטיחים את הגנת ה-server על impersonation: ה-client לא
 * יכול לזייף actingAs כי loadVerifiedImpersonation טוענת תמיד מ-DB.
 *
 * Critical paths:
 *   - Wrong impersonator → null
 *   - Already ended → null
 *   - Target blocked → null
 *   - Impersonator blocked → null
 *   - Cross-organization → null
 *   - DB error → null (fail-secure)
 *   - Valid → returns full payload from DB
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const findUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    impersonationSession: {
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));

import { loadVerifiedImpersonation } from "../impersonation";

const VALID_DB_SESSION = {
  id: "imp_session_1",
  impersonatorId: "owner_1",
  targetUserId: "therapist_1",
  targetNameSnapshot: "ד״ר תרצה לוי",
  organizationId: "org_1",
  startedAt: new Date("2026-05-07T10:00:00Z"),
  endedAt: null,
  targetUser: {
    role: "USER" as const,
    clinicRole: "THERAPIST" as const,
    isBlocked: false,
    organizationId: "org_1",
  },
  impersonator: {
    organizationId: "org_1",
    isBlocked: false,
  },
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadVerifiedImpersonation", () => {
  it("returns full payload from DB when session is valid", async () => {
    findUnique.mockResolvedValue(VALID_DB_SESSION);
    const result = await loadVerifiedImpersonation("imp_session_1", "owner_1");
    expect(result).toEqual({
      userId: "therapist_1",
      name: "ד״ר תרצה לוי",
      role: "USER",
      clinicRole: "THERAPIST",
      organizationId: "org_1",
      sessionId: "imp_session_1",
      startedAt: VALID_DB_SESSION.startedAt.getTime(),
    });
  });

  it("returns null when session does not exist", async () => {
    findUnique.mockResolvedValue(null);
    const result = await loadVerifiedImpersonation("nonexistent", "owner_1");
    expect(result).toBeNull();
  });

  it("returns null when impersonatorId does not match (privilege escalation guard)", async () => {
    findUnique.mockResolvedValue(VALID_DB_SESSION);
    // OWNER_2 מנסה להשתמש ב-sessionId של OWNER_1
    const result = await loadVerifiedImpersonation("imp_session_1", "owner_2");
    expect(result).toBeNull();
  });

  it("returns null when session has already ended", async () => {
    findUnique.mockResolvedValue({
      ...VALID_DB_SESSION,
      endedAt: new Date("2026-05-07T11:00:00Z"),
    });
    const result = await loadVerifiedImpersonation("imp_session_1", "owner_1");
    expect(result).toBeNull();
  });

  it("returns null when target user is blocked", async () => {
    findUnique.mockResolvedValue({
      ...VALID_DB_SESSION,
      targetUser: { ...VALID_DB_SESSION.targetUser, isBlocked: true },
    });
    const result = await loadVerifiedImpersonation("imp_session_1", "owner_1");
    expect(result).toBeNull();
  });

  it("returns null when impersonator is blocked", async () => {
    findUnique.mockResolvedValue({
      ...VALID_DB_SESSION,
      impersonator: { ...VALID_DB_SESSION.impersonator, isBlocked: true },
    });
    const result = await loadVerifiedImpersonation("imp_session_1", "owner_1");
    expect(result).toBeNull();
  });

  it("returns null when target moved to a different organization (cross-org guard)", async () => {
    findUnique.mockResolvedValue({
      ...VALID_DB_SESSION,
      targetUser: { ...VALID_DB_SESSION.targetUser, organizationId: "org_2" },
    });
    const result = await loadVerifiedImpersonation("imp_session_1", "owner_1");
    expect(result).toBeNull();
  });

  it("returns null on DB error (fail-secure)", async () => {
    findUnique.mockRejectedValue(new Error("connection refused"));
    const result = await loadVerifiedImpersonation("imp_session_1", "owner_1");
    expect(result).toBeNull();
  });

  it("returns null when impersonator is no longer in any org (left clinic mid-session)", async () => {
    findUnique.mockResolvedValue({
      ...VALID_DB_SESSION,
      impersonator: { organizationId: null, isBlocked: false },
    });
    // target.organizationId === "org_1" !== impersonator.organizationId === null
    const result = await loadVerifiedImpersonation("imp_session_1", "owner_1");
    expect(result).toBeNull();
  });

  it("uses targetNameSnapshot, not target's current name (preserves audit trail)", async () => {
    findUnique.mockResolvedValue({
      ...VALID_DB_SESSION,
      targetNameSnapshot: "השם בעת ההתחזות",
    });
    const result = await loadVerifiedImpersonation("imp_session_1", "owner_1");
    expect(result?.name).toBe("השם בעת ההתחזות");
  });

  it("returns startedAt as epoch ms (serializable for JWT)", async () => {
    const startedAt = new Date("2026-01-01T12:34:56Z");
    findUnique.mockResolvedValue({ ...VALID_DB_SESSION, startedAt });
    const result = await loadVerifiedImpersonation("imp_session_1", "owner_1");
    expect(result?.startedAt).toBe(startedAt.getTime());
    expect(typeof result?.startedAt).toBe("number");
  });
});
