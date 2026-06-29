import { describe, it, expect } from "vitest";
import {
  encryptFields,
  DECRYPT_ERROR_MARKER,
  DECRYPT_JSON_ERROR_MARKER,
} from "@/lib/encrypted-fields";
import { isEncrypted } from "@/lib/encryption";

/**
 * חלק א' (סבב אבטחה 2026-06-29): guard מפני round-trip שדורס PHI.
 *
 * תרחיש הבאג: פענוח נכשל → maybeDecrypt/maybeDecryptJson מחזירים marker של
 * שגיאה במקום ה-PHI → המשתמש רואה את ה-marker בטופס ושומר → בלי הguard,
 * הextension מצפין את ה-marker וכותב אותו ל-DB → ה-PHI המקורי נמחק לצמיתות.
 *
 * הצפנה = שינוי קריטי → TDD. הבדיקות מוודאות שכתיבת marker *נכשלת רועש*
 * (refusing) במקום לדרוס בשקט.
 */
describe("encryptFields — guard מפני דריסת PHI ב-marker שגיאת פענוח", () => {
  describe("שדות טקסט (maybeEncrypt)", () => {
    it("מסרב להצפין את ה-marker של שגיאת פענוח (זריקה)", () => {
      expect(() =>
        encryptFields("client", { notes: DECRYPT_ERROR_MARKER }),
      ).toThrow();
    });

    it("מסרב גם דרך אופרטור set של Prisma ({ set: marker })", () => {
      expect(() =>
        encryptFields("client", { notes: { set: DECRYPT_ERROR_MARKER } }),
      ).toThrow();
    });

    it("מסרב כשה-marker בשדה מוצפן אחר (initialDiagnosis)", () => {
      expect(() =>
        encryptFields("client", { initialDiagnosis: DECRYPT_ERROR_MARKER }),
      ).toThrow();
    });
  });

  describe("שדות JSON (maybeEncryptJson)", () => {
    it("מסרב להצפין את צורת כשל הפענוח של JSON ({ error: marker })", () => {
      expect(() =>
        encryptFields("client", {
          medicalHistory: { error: DECRYPT_JSON_ERROR_MARKER },
        }),
      ).toThrow();
    });

    it("מסרב גם דרך אופרטור set ({ set: { error: marker } })", () => {
      expect(() =>
        encryptFields("client", {
          medicalHistory: { set: { error: DECRYPT_JSON_ERROR_MARKER } },
        }),
      ).toThrow();
    });
  });

  describe("רגרסיה — ערכים תקינים ממשיכים להיות מוצפנים כרגיל", () => {
    it("שדה טקסט תקין מוצפן (לא נזרק)", () => {
      const data = encryptFields("client", { notes: "מטופל אמיתי, PHI" }) as {
        notes: string;
      };
      expect(typeof data.notes).toBe("string");
      expect(isEncrypted(data.notes)).toBe(true);
    });

    it("שדה JSON תקין מוצפן (עטוף ב-__enc__, לא נזרק)", () => {
      const data = encryptFields("client", {
        medicalHistory: { allergies: ["X"], notes: "רקע" },
      }) as { medicalHistory: Record<string, unknown> };
      expect(data.medicalHistory).toHaveProperty("__enc__");
      expect(typeof data.medicalHistory.__enc__).toBe("string");
    });

    it("אובייקט JSON תקין עם מפתח error לגיטימי (לא ה-marker) מוצפן ולא נזרק", () => {
      const data = encryptFields("client", {
        medicalHistory: { error: "תופעת לוואי שדווחה" },
      }) as { medicalHistory: Record<string, unknown> };
      expect(data.medicalHistory).toHaveProperty("__enc__");
    });
  });
});
