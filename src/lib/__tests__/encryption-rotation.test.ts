import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, isEncrypted } from "@/lib/encryption";

/**
 * חלק ב' (סבב אבטחה 2026-06-29): key versioning / rotation.
 *
 * המנגנון מאפשר להחזיק כמה מפתחות יחד ולסובב ביניהם בלי לאבד PHI היסטורי.
 * הפורמט החדש: `v<id>:salt:iv:authTag:ciphertext` (5 חלקים). רשומות בלי
 * prefix (4 חלקים / 3 חלקים legacy) ממשיכות להתפענח עם ENCRYPTION_KEY הקיים.
 *
 * env vars:
 *   ENCRYPTION_KEY          — מפתח default/legacy (רשומות בלי prefix).
 *   ENCRYPTION_KEY_V<n>     — מפתחות ממוספרים נוספים.
 *   ENCRYPTION_KEY_CURRENT  — איזה מפתח-id לכתיבות חדשות (ריק = מצב אינרטי).
 *
 * הבדיקות משנות process.env בכל בדיקה — encrypt/decrypt קוראים env per-call,
 * ולכן יש לשמור/לשחזר את המשתנים סביב כל בדיקה.
 */

const VARS = [
  "ENCRYPTION_KEY",
  "ENCRYPTION_KEY_V2",
  "ENCRYPTION_KEY_V3",
  "ENCRYPTION_KEY_CURRENT",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const v of VARS) saved[v] = process.env[v];
  // baseline דטרמיניסטי: מפתח default ידוע, בלי גרסאות, מצב אינרטי.
  process.env.ENCRYPTION_KEY = "test-default-encryption-key-0123456789abcdef";
  delete process.env.ENCRYPTION_KEY_V2;
  delete process.env.ENCRYPTION_KEY_V3;
  delete process.env.ENCRYPTION_KEY_CURRENT;
});

afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

describe("הצפנה — key versioning / rotation", () => {
  it("מצב אינרטי (בלי ENCRYPTION_KEY_CURRENT): כותב פורמט לא-מגורסה (4 חלקים) ומפענח", () => {
    const ct = encrypt("סוד קליני");
    expect(ct.split(":").length).toBe(4);
    expect(/^v\d+:/.test(ct)).toBe(false);
    expect(decrypt(ct)).toBe("סוד קליני");
  });

  it("מצב מגורסה (CURRENT=v2): כותב prefix v2: (5 חלקים) ומפענח עם המפתח החדש", () => {
    process.env.ENCRYPTION_KEY_V2 = "brand-new-key-v2-abcdef0123456789wxyz";
    process.env.ENCRYPTION_KEY_CURRENT = "v2";
    const ct = encrypt("סוד חדש");
    expect(ct.startsWith("v2:")).toBe(true);
    expect(ct.split(":").length).toBe(5);
    expect(decrypt(ct)).toBe("סוד חדש");
  });

  it("תאימות לאחור: נתון שנכתב במצב אינרטי מתפענח גם אחרי מעבר ל-v2", () => {
    const oldCt = encrypt("PHI ישן"); // unversioned, נכתב עם ENCRYPTION_KEY
    process.env.ENCRYPTION_KEY_V2 = "brand-new-key-v2-abcdef0123456789wxyz";
    process.env.ENCRYPTION_KEY_CURRENT = "v2";
    // עכשיו כותבים ב-v2, אבל הנתון הישן עדיין נקרא עם ה-default key
    expect(decrypt(oldCt)).toBe("PHI ישן");
  });

  it("cross-key: נתון שנכתב עם v2 מתפענח גם כשהמפתח הנוכחי כבר v3", () => {
    process.env.ENCRYPTION_KEY_V2 = "key-v2-aaaa1111bbbb2222cccc3333dddd";
    process.env.ENCRYPTION_KEY_CURRENT = "v2";
    const ctV2 = encrypt("נכתב עם v2");
    // סיבוב נוסף ל-v3 — v2 נשאר ברישום
    process.env.ENCRYPTION_KEY_V3 = "key-v3-eeee4444ffff5555gggg6666hhhh";
    process.env.ENCRYPTION_KEY_CURRENT = "v3";
    expect(decrypt(ctV2)).toBe("נכתב עם v2");
  });

  it("שני מפתחות יוצרים ciphertext שונה לאותו טקסט, ושניהם מפענחים נכון", () => {
    const ctDefault = encrypt("אותו טקסט");
    process.env.ENCRYPTION_KEY_V2 = "key-v2-aaaa1111bbbb2222cccc3333dddd";
    process.env.ENCRYPTION_KEY_CURRENT = "v2";
    const ctV2 = encrypt("אותו טקסט");
    expect(ctDefault).not.toBe(ctV2);
    expect(decrypt(ctV2)).toBe("אותו טקסט");
    expect(decrypt(ctDefault)).toBe("אותו טקסט");
  });

  it("isEncrypted מזהה פורמט מגורסה (idempotency — לא להצפין כפול)", () => {
    process.env.ENCRYPTION_KEY_V2 = "brand-new-key-v2-abcdef0123456789wxyz";
    process.env.ENCRYPTION_KEY_CURRENT = "v2";
    const ct = encrypt("x");
    expect(isEncrypted(ct)).toBe(true);
  });

  it("isEncrypted מחזיר false על 5 חלקים שאינם מתחילים ב-key-id תקין", () => {
    // לא v<num> בהתחלה → לא פורמט מגורסה
    expect(isEncrypted("abcd:ef01:2345:6789:beef")).toBe(false);
  });

  it("מפתח לא-מוכר בפענוח → נכשל בטוח (זריקה, לא plaintext דלוף)", () => {
    process.env.ENCRYPTION_KEY_V2 = "brand-new-key-v2-abcdef0123456789wxyz";
    process.env.ENCRYPTION_KEY_CURRENT = "v2";
    const ct = encrypt("סוד");
    // המפתח v2 נעלם מהרישום → אסור לפענח, אסור להחזיר plaintext
    delete process.env.ENCRYPTION_KEY_V2;
    delete process.env.ENCRYPTION_KEY_CURRENT;
    expect(() => decrypt(ct)).toThrow();
  });

  it("CURRENT מצביע על מפתח שלא הוגדר → encrypt נכשל (לא כותב עם default בשקט)", () => {
    process.env.ENCRYPTION_KEY_CURRENT = "v2"; // אבל ENCRYPTION_KEY_V2 לא הוגדר
    expect(() => encrypt("סוד")).toThrow();
  });

  it("CURRENT בפורמט לא-חוקי → encrypt נכשל", () => {
    process.env.ENCRYPTION_KEY_CURRENT = "version-two"; // לא תואם ^v\\d+$
    process.env.ENCRYPTION_KEY_V2 = "x";
    expect(() => encrypt("סוד")).toThrow();
  });
});
