import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

import { chatMemberWhere, teamChannelId } from "@/lib/chat/chat-service";

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

  describe("chatMemberWhere — בידוד ארגוני", () => {
    it("מסנן לפי organizationId ולא חסומים", () => {
      const where = chatMemberWhere("org_42");
      expect(where.organizationId).toBe("org_42");
      expect(where.isBlocked).toBe(false);
    });

    it("כולל אך ורק OWNER/SECRETARY (clinicRole או role)", () => {
      const where = chatMemberWhere("org_42");
      const or = where.OR as Array<Record<string, { in: string[] }>>;
      expect(Array.isArray(or)).toBe(true);

      const clinicRoleClause = or.find((c) => "clinicRole" in c);
      expect(clinicRoleClause?.clinicRole.in).toEqual(["OWNER", "SECRETARY"]);

      const roleClause = or.find((c) => "role" in c);
      expect(roleClause?.role.in).toEqual([
        "CLINIC_OWNER",
        "CLINIC_SECRETARY",
      ]);
    });

    it("לא כולל THERAPIST — מטפלים מחוץ לצ'אט בשלב זה", () => {
      const where = chatMemberWhere("org_42");
      const serialized = JSON.stringify(where);
      expect(serialized).not.toContain("THERAPIST");
    });
  });
});
