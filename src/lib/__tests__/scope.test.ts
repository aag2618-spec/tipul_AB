import { describe, it, expect } from "vitest";
import {
  buildClientWhere,
  buildSessionWhere,
  buildPaymentWhere,
  isSecretary,
  isClinicOwner,
  isClinicTherapist,
  isOrgMember,
  secretaryCan,
  canSecretaryAccessModel,
  getClientSafeSelectForSecretary,
  CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY,
  type ScopeUser,
} from "@/lib/scope";

const standaloneUser: ScopeUser = {
  id: "u1",
  role: "USER",
  organizationId: null,
  clinicRole: null,
  secretaryPermissions: null,
};

const owner: ScopeUser = {
  id: "u2",
  role: "CLINIC_OWNER",
  organizationId: "org1",
  clinicRole: "OWNER",
  secretaryPermissions: null,
};

const clinicTherapist: ScopeUser = {
  id: "u3",
  role: "USER",
  organizationId: "org1",
  clinicRole: "THERAPIST",
  secretaryPermissions: null,
};

const secretaryFull: ScopeUser = {
  id: "u4",
  role: "CLINIC_SECRETARY",
  organizationId: "org1",
  clinicRole: "SECRETARY",
  secretaryPermissions: {
    canViewPayments: true,
    canIssueReceipts: true,
    canSendReminders: true,
    canCreateClient: true,
    canViewDebts: true,
    canViewStats: true,
  },
};

const secretaryNoPerms: ScopeUser = {
  id: "u5",
  role: "CLINIC_SECRETARY",
  organizationId: "org1",
  clinicRole: "SECRETARY",
  secretaryPermissions: null,
};

const adminUser: ScopeUser = {
  id: "u6",
  role: "ADMIN",
  organizationId: null,
  clinicRole: null,
  secretaryPermissions: null,
};

describe("isSecretary", () => {
  it("returns true for clinicRole=SECRETARY", () => {
    expect(isSecretary(secretaryFull)).toBe(true);
  });
  it("returns true if role=CLINIC_SECRETARY (even without clinicRole)", () => {
    const u: ScopeUser = { ...secretaryFull, clinicRole: null };
    expect(isSecretary(u)).toBe(true);
  });
  it("returns false for non-secretary roles", () => {
    expect(isSecretary(standaloneUser)).toBe(false);
    expect(isSecretary(owner)).toBe(false);
    expect(isSecretary(clinicTherapist)).toBe(false);
    expect(isSecretary(adminUser)).toBe(false);
  });
});

describe("isClinicOwner", () => {
  it("identifies clinic owner correctly", () => {
    expect(isClinicOwner(owner)).toBe(true);
    expect(isClinicOwner(standaloneUser)).toBe(false);
    expect(isClinicOwner(clinicTherapist)).toBe(false);
    expect(isClinicOwner(secretaryFull)).toBe(false);
  });
});

describe("isClinicTherapist", () => {
  it("identifies clinic therapist (must have org and THERAPIST role)", () => {
    expect(isClinicTherapist(clinicTherapist)).toBe(true);
  });
  it("excludes standalone user (no org)", () => {
    expect(isClinicTherapist(standaloneUser)).toBe(false);
  });
  it("excludes owner and secretary", () => {
    expect(isClinicTherapist(owner)).toBe(false);
    expect(isClinicTherapist(secretaryFull)).toBe(false);
  });
});

describe("isOrgMember", () => {
  it("returns true if organizationId set", () => {
    expect(isOrgMember(owner)).toBe(true);
    expect(isOrgMember(clinicTherapist)).toBe(true);
    expect(isOrgMember(secretaryFull)).toBe(true);
  });
  it("returns false for standalone user", () => {
    expect(isOrgMember(standaloneUser)).toBe(false);
  });
});

describe("secretaryCan", () => {
  it("returns true for non-secretary regardless of permission", () => {
    expect(secretaryCan(owner, "canViewPayments")).toBe(true);
    expect(secretaryCan(clinicTherapist, "canSendReminders")).toBe(true);
    expect(secretaryCan(standaloneUser, "canViewStats")).toBe(true);
  });

  it("respects matrix for secretary", () => {
    expect(secretaryCan(secretaryFull, "canViewPayments")).toBe(true);
    expect(secretaryCan(secretaryFull, "canSendReminders")).toBe(true);
  });

  it("denies secretary without permissions matrix (deny by default)", () => {
    expect(secretaryCan(secretaryNoPerms, "canViewPayments")).toBe(false);
    expect(secretaryCan(secretaryNoPerms, "canSendReminders")).toBe(false);
    expect(secretaryCan(secretaryNoPerms, "canViewStats")).toBe(false);
  });

  it("denies specific permission when set false", () => {
    const partial: ScopeUser = {
      ...secretaryFull,
      secretaryPermissions: { canViewPayments: false, canSendReminders: true },
    };
    expect(secretaryCan(partial, "canViewPayments")).toBe(false);
    expect(secretaryCan(partial, "canSendReminders")).toBe(true);
  });
});

describe("canSecretaryAccessModel", () => {
  it("non-secretary can access all models", () => {
    expect(canSecretaryAccessModel(owner, "SessionNote")).toBe(true);
    expect(canSecretaryAccessModel(clinicTherapist, "SessionAnalysis")).toBe(true);
  });

  it("secretary blocked from clinical models — hard-coded", () => {
    expect(canSecretaryAccessModel(secretaryFull, "SessionNote")).toBe(false);
    expect(canSecretaryAccessModel(secretaryFull, "SessionAnalysis")).toBe(false);
    expect(canSecretaryAccessModel(secretaryFull, "Recording")).toBe(false);
    expect(canSecretaryAccessModel(secretaryFull, "AIInsight")).toBe(false);
  });

  it("secretary CAN access non-clinical models", () => {
    expect(canSecretaryAccessModel(secretaryFull, "Payment")).toBe(true);
    expect(canSecretaryAccessModel(secretaryFull, "Client")).toBe(true);
    expect(canSecretaryAccessModel(secretaryFull, "TherapySession")).toBe(true);
  });

  it("blocking is independent of secretaryPermissions", () => {
    const fakePermissive: ScopeUser = {
      ...secretaryFull,
      secretaryPermissions: {
        ...secretaryFull.secretaryPermissions!,
      },
    };
    expect(canSecretaryAccessModel(fakePermissive, "SessionNote")).toBe(false);
  });
});

describe("buildClientWhere", () => {
  it("standalone user — sees only own clients", () => {
    expect(buildClientWhere(standaloneUser)).toEqual({ therapistId: "u1" });
  });

  it("clinic owner — sees all org clients", () => {
    expect(buildClientWhere(owner)).toEqual({ organizationId: "org1" });
  });

  it("clinic therapist — sees only own clients within org", () => {
    expect(buildClientWhere(clinicTherapist)).toEqual({
      organizationId: "org1",
      therapistId: "u3",
    });
  });

  it("secretary — sees all org clients", () => {
    expect(buildClientWhere(secretaryFull)).toEqual({ organizationId: "org1" });
  });

  it("ADMIN — empty where (sees everything, dangerous)", () => {
    expect(buildClientWhere(adminUser)).toEqual({});
  });

  it("MANAGER — empty where", () => {
    const manager: ScopeUser = { ...adminUser, role: "MANAGER" };
    expect(buildClientWhere(manager)).toEqual({});
  });

  it("safety fallback: organizationId+null clinicRole — sees only own", () => {
    const odd: ScopeUser = {
      id: "u9",
      role: "USER",
      organizationId: "org1",
      clinicRole: null,
      secretaryPermissions: null,
    };
    expect(buildClientWhere(odd)).toEqual({ therapistId: "u9" });
  });
});

describe("buildSessionWhere", () => {
  it("matches buildClientWhere for sessions", () => {
    expect(buildSessionWhere(standaloneUser)).toEqual({ therapistId: "u1" });
    expect(buildSessionWhere(owner)).toEqual({ organizationId: "org1" });
    expect(buildSessionWhere(clinicTherapist)).toEqual({
      organizationId: "org1",
      therapistId: "u3",
    });
    expect(buildSessionWhere(secretaryFull)).toEqual({ organizationId: "org1" });
  });
});

describe("buildPaymentWhere", () => {
  it("standalone user — payments via client.therapistId", () => {
    expect(buildPaymentWhere(standaloneUser)).toEqual({
      client: { therapistId: "u1" },
    });
  });

  it("clinic owner — sees all org payments", () => {
    expect(buildPaymentWhere(owner)).toEqual({ organizationId: "org1" });
  });

  it("clinic therapist — only own clients' payments", () => {
    expect(buildPaymentWhere(clinicTherapist)).toEqual({
      organizationId: "org1",
      client: { therapistId: "u3" },
    });
  });

  it("secretary WITH canViewPayments — sees all org payments", () => {
    expect(buildPaymentWhere(secretaryFull)).toEqual({ organizationId: "org1" });
  });

  it("secretary WITHOUT canViewPayments — deny clause", () => {
    expect(buildPaymentWhere(secretaryNoPerms)).toEqual({ id: "__deny__" });
  });

  it("secretary with canViewPayments=false explicit — deny", () => {
    const sec: ScopeUser = {
      ...secretaryFull,
      secretaryPermissions: { canViewPayments: false },
    };
    expect(buildPaymentWhere(sec)).toEqual({ id: "__deny__" });
  });
});

describe("getClientSafeSelectForSecretary", () => {
  it("excludes initialDiagnosis and intakeNotes", () => {
    const sel = getClientSafeSelectForSecretary() as Record<string, unknown>;
    expect(sel.initialDiagnosis).toBeUndefined();
    expect(sel.intakeNotes).toBeUndefined();
  });

  it("includes basic identity fields", () => {
    const sel = getClientSafeSelectForSecretary() as Record<string, unknown>;
    expect(sel.firstName).toBe(true);
    expect(sel.lastName).toBe(true);
    expect(sel.email).toBe(true);
    expect(sel.phone).toBe(true);
  });
});

describe("CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY", () => {
  it("documents blocked clinical fields on Client", () => {
    expect(CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.client).toContain("initialDiagnosis");
    expect(CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.client).toContain("intakeNotes");
  });

  it("blocks Recording, AI, and analysis models", () => {
    const blocked = CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.blockedModels as readonly string[];
    expect(blocked).toContain("SessionNote");
    expect(blocked).toContain("SessionAnalysis");
    expect(blocked).toContain("Recording");
    expect(blocked).toContain("AIInsight");
  });
});
