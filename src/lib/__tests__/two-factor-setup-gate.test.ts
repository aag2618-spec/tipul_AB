import { describe, it, expect } from "vitest";

// two-factor.ts מייבא prisma (ש-throw אם DATABASE_URL לא מוגדר בסביבת הבדיקה).
// ה-helper הנבדק כאן הוא pure ולא נוגע ב-DB — mock מינימלי מספיק כדי לטעון את המודול.
import { vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ default: {} }));

import { requires2FASetup, requires2FA } from "@/lib/two-factor";

// force-setup gate (2026-06-29): כל אנשי הצוות חייבים 2FA — ללא יוצא מן הכלל.
// requires2FASetup מחזיר true כש-2FA אינו מופעל; בלעדי ל-requires2FA (שמחייב
// twoFactorEnabled=true).
const STAFF_ROLES = [
  "USER",
  "MANAGER",
  "ADMIN",
  "CLINIC_OWNER",
  "CLINIC_SECRETARY",
] as const;

describe("requires2FASetup — אכיפת הקמת 2FA לכל התפקידים", () => {
  it("כל תפקיד צוות ללא 2FA מופעל → חייב הקמה (true)", () => {
    for (const role of STAFF_ROLES) {
      expect(requires2FASetup({ role, twoFactorEnabled: false })).toBe(true);
    }
  });

  it("כל תפקיד צוות עם 2FA מופעל → לא דורש הקמה (false)", () => {
    for (const role of STAFF_ROLES) {
      expect(requires2FASetup({ role, twoFactorEnabled: true })).toBe(false);
    }
  });

  it("תפקיד לא-מוכר (לא staff) → לא דורש הקמה (false)", () => {
    expect(requires2FASetup({ role: "CLIENT", twoFactorEnabled: false })).toBe(false);
    expect(requires2FASetup({ role: "", twoFactorEnabled: false })).toBe(false);
  });

  it("בלעדיות: כשצריך הקמה (אין 2FA) — requires2FA תמיד false", () => {
    for (const role of STAFF_ROLES) {
      const user = { role, twoFactorEnabled: false, lastActivityAt: null };
      expect(requires2FASetup(user)).toBe(true);
      // אי אפשר לאמת קוד למי שלא הקים — requires2FA מחזיר false.
      expect(requires2FA(user)).toBe(false);
    }
  });
});
