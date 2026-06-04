import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

import {
  chatMemberWhere,
  managementMemberWhere,
  teamChannelId,
  memberKind,
  canPairChat,
  isTherapistOnly,
} from "@/lib/chat/chat-service";

describe("chat-service — פונקציות טהורות", () => {
  describe("teamChannelId", () => {
    it("דטרמיניסטי ויציב לאותו ארגון", () => {
      expect(teamChannelId("org_1")).toBe("team_org_1");
      expect(teamChannelId("org_1")).toBe(teamChannelId("org_1"));
    });

    it("שונה בין ארגונים — מבטיח ערוץ נפרד לכל קליניקה", () => {
      expect(teamChannelId("org_2")).not.toBe(teamChannelId("org_1"));
    });
  });

  describe("chatMemberWhere — בידוד ארגוני + כל אנשי הצוות", () => {
    it("מסנן לפי organizationId ולא חסומים", () => {
      const where = chatMemberWhere("org_42");
      expect(where.organizationId).toBe("org_42");
      expect(where.isBlocked).toBe(false);
    });

    it("כולל OWNER/SECRETARY/THERAPIST (clinicRole) ו-CLINIC_OWNER/CLINIC_SECRETARY (role)", () => {
      const where = chatMemberWhere("org_42");
      const or = where.OR as Array<Record<string, { in: string[] }>>;
      expect(Array.isArray(or)).toBe(true);

      const clinicRoleClause = or.find((c) => "clinicRole" in c);
      expect(clinicRoleClause?.clinicRole.in).toEqual([
        "OWNER",
        "SECRETARY",
        "THERAPIST",
      ]);

      const roleClause = or.find((c) => "role" in c);
      expect(roleClause?.role.in).toEqual(["CLINIC_OWNER", "CLINIC_SECRETARY"]);
    });

    it("כולל THERAPIST — מטפלים הם חברי צ'אט", () => {
      const serialized = JSON.stringify(chatMemberWhere("org_42"));
      expect(serialized).toContain("THERAPIST");
    });
  });

  describe("managementMemberWhere — ערוץ ההנהלה (מנהלת + מזכירות בלבד)", () => {
    it("מסנן לפי organizationId ולא חסומים", () => {
      const where = managementMemberWhere("org_42");
      expect(where.organizationId).toBe("org_42");
      expect(where.isBlocked).toBe(false);
    });

    it("כולל אך ורק OWNER/SECRETARY — לא מטפלים", () => {
      const where = managementMemberWhere("org_42");
      const or = where.OR as Array<Record<string, { in: string[] }>>;
      const clinicRoleClause = or.find((c) => "clinicRole" in c);
      expect(clinicRoleClause?.clinicRole.in).toEqual(["OWNER", "SECRETARY"]);

      // קריטי: ערוץ "כל הצוות" נשאר של ההנהלה — מטפלים לא מסונכרנים אליו.
      expect(JSON.stringify(where)).not.toContain("THERAPIST");
    });
  });

  describe("memberKind — סיווג ניהול מול מטפל", () => {
    it("מנהלת/מזכירה (לפי clinicRole) = MANAGEMENT", () => {
      expect(memberKind("OWNER", "USER")).toBe("MANAGEMENT");
      expect(memberKind("SECRETARY", "USER")).toBe("MANAGEMENT");
    });

    it("מנהלת/מזכירה (לפי role גלובלי, clinicRole=null) = MANAGEMENT", () => {
      expect(memberKind(null, "CLINIC_OWNER")).toBe("MANAGEMENT");
      expect(memberKind(null, "CLINIC_SECRETARY")).toBe("MANAGEMENT");
    });

    it("מטפל = THERAPIST", () => {
      expect(memberKind("THERAPIST", "USER")).toBe("THERAPIST");
    });

    it("ברירת מחדל בטוחה — לא-ניהול נופל ל-THERAPIST (המוגבל יותר)", () => {
      expect(memberKind(null, "USER")).toBe("THERAPIST");
    });
  });

  describe("canPairChat — מי רשאי להתכתב עם מי", () => {
    it("ניהול ↔ כל אחד — תמיד מותר (גם כשהדגל כבוי)", () => {
      expect(canPairChat("MANAGEMENT", "MANAGEMENT", false)).toBe(true);
      expect(canPairChat("MANAGEMENT", "THERAPIST", false)).toBe(true);
      expect(canPairChat("THERAPIST", "MANAGEMENT", false)).toBe(true);
    });

    it("מטפל ↔ מטפל — חסום כשהדגל כבוי (deny-by-default)", () => {
      expect(canPairChat("THERAPIST", "THERAPIST", false)).toBe(false);
    });

    it("מטפל ↔ מטפל — מותר רק כשהמנהלת הפעילה את הדגל", () => {
      expect(canPairChat("THERAPIST", "THERAPIST", true)).toBe(true);
    });

    it("סימטרי — סדר הצדדים לא משנה", () => {
      expect(canPairChat("THERAPIST", "MANAGEMENT", false)).toBe(
        canPairChat("MANAGEMENT", "THERAPIST", false)
      );
    });
  });

  describe("isTherapistOnly — שיחה בין מטפלים בלבד (שקיפות + מעקב)", () => {
    it("שני מטפלים → true", () => {
      expect(
        isTherapistOnly([
          { clinicRole: "THERAPIST", role: "USER" },
          { clinicRole: "THERAPIST", role: "USER" },
        ])
      ).toBe(true);
    });

    it("מטפל + מנהלת → false", () => {
      expect(
        isTherapistOnly([
          { clinicRole: "THERAPIST", role: "USER" },
          { clinicRole: "OWNER", role: "USER" },
        ])
      ).toBe(false);
    });

    it("מטפל + מזכירה → false", () => {
      expect(
        isTherapistOnly([
          { clinicRole: "THERAPIST", role: "USER" },
          { clinicRole: "SECRETARY", role: "USER" },
        ])
      ).toBe(false);
    });

    it("מנהלת לפי role גלובלי (clinicRole=null) → false", () => {
      expect(
        isTherapistOnly([
          { clinicRole: "THERAPIST", role: "USER" },
          { clinicRole: null, role: "CLINIC_OWNER" },
        ])
      ).toBe(false);
    });

    it("מערך ריק → false (הגנה מפני every על ריק)", () => {
      expect(isTherapistOnly([])).toBe(false);
    });
  });
});
