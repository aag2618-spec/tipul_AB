import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

import { applySecretaryMode } from "@/lib/secretary-mode";
import {
  isSecretary,
  isSecretaryTherapist,
  buildClientWhere,
  buildSessionWhere,
  getSessionIncludeForRole,
  type ScopeUser,
} from "@/lib/scope";

const secretaryTherapist: ScopeUser = {
  id: "u1",
  role: "CLINIC_SECRETARY",
  organizationId: "org1",
  clinicRole: "SECRETARY",
  secretaryPermissions: { canViewPayments: true },
  secretaryIsTherapist: true,
};

const regularSecretary: ScopeUser = {
  id: "u2",
  role: "CLINIC_SECRETARY",
  organizationId: "org1",
  clinicRole: "SECRETARY",
  secretaryPermissions: { canViewPayments: true },
  secretaryIsTherapist: false,
};

const owner: ScopeUser = {
  id: "u3",
  role: "CLINIC_OWNER",
  organizationId: "org1",
  clinicRole: "OWNER",
  secretaryPermissions: null,
};

describe("applySecretaryMode — secretary mode (default)", () => {
  it("leaves the secretary-therapist unchanged in secretary mode", () => {
    const u = applySecretaryMode(secretaryTherapist, "secretary");
    expect(u).toEqual(secretaryTherapist);
    expect(isSecretary(u)).toBe(true);
  });
});

describe("applySecretaryMode — therapist mode", () => {
  it("flips a secretary-therapist to behave as a clinic therapist", () => {
    const u = applySecretaryMode(secretaryTherapist, "therapist");
    expect(isSecretary(u)).toBe(false);
    expect(isSecretaryTherapist(u)).toBe(false);
    expect(u.clinicRole).toBe("THERAPIST");
    expect(u.role).toBe("USER"); // CLINIC_SECRETARY neutralized
    expect(u.secretaryPermissions).toBeNull();
  });

  it("does NOT affect a regular secretary (no flag)", () => {
    const u = applySecretaryMode(regularSecretary, "therapist");
    expect(u).toEqual(regularSecretary);
    expect(isSecretary(u)).toBe(true);
  });

  it("does NOT affect non-secretaries (owner)", () => {
    const u = applySecretaryMode(owner, "therapist");
    expect(u).toEqual(owner);
  });
});

describe("PHI invariant — therapist mode couples own-only scope with full clinical access", () => {
  it("therapist mode → client/session scope is own-only (therapistId=self)", () => {
    const u = applySecretaryMode(secretaryTherapist, "therapist");
    expect(buildClientWhere(u)).toEqual({
      organizationId: "org1",
      therapistId: "u1",
    });
    expect(buildSessionWhere(u)).toEqual({
      organizationId: "org1",
      therapistId: "u1",
    });
  });

  it("therapist mode → full clinical include (sessionNote loaded, not safe-select)", () => {
    const u = applySecretaryMode(secretaryTherapist, "therapist");
    const include = getSessionIncludeForRole(u);
    expect(include).toEqual({ client: true, sessionNote: true });
  });

  it("secretary mode → org-wide scope but clinical content blocked (safe-select only)", () => {
    const u = applySecretaryMode(secretaryTherapist, "secretary");
    // ארגוני — רואה את כל הקליניקה
    expect(buildClientWhere(u)).toEqual({ organizationId: "org1" });
    // אבל ה-include הוא safe (בלי sessionNote) — תוכן קליני חסום
    const include = getSessionIncludeForRole(u);
    expect(include).not.toHaveProperty("sessionNote");
  });
});
