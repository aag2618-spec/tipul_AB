import { describe, it, expect, vi } from "vitest";

// two-factor.ts מייבא prisma (ש-throw אם DATABASE_URL לא מוגדר בסביבת הבדיקה).
// ה-helper הנבדק כאן הוא pure ולא נוגע ב-DB — mock מינימלי מספיק כדי לטעון את המודול.
vi.mock("@/lib/prisma", () => ({ default: {} }));

import { isTwoFactorVerifiedForLogin } from "@/lib/two-factor";

// Anti-2FA-bypass (2026-06-10). ה-jwt callback מנקה את requires2FA רק אם
// isTwoFactorVerifiedForLogin מחזיר true עבור ה-loginAt הספציפי של ה-token.
// השוויון המדויק (לא ">") הוא מה שסוגר את עקיפת ה-2FA בין sessions.
describe("isTwoFactorVerifiedForLogin — קשירת אימות 2FA ל-login הספציפי", () => {
  it("חוסם את העקיפה: אימות שבוצע ל-login אחר (T3) לא משחרר token ישן (T1)", () => {
    // תרחיש: תוקף שיודע את הסיסמה התחבר ב-T1 (loginAt=1000) ומחזיק cookie חצי-מאומת.
    // אחר כך הקורבן התחבר ועבר 2FA ב-T3 → twoFactorVerifiedForLoginAt=3000n.
    // התוקף מפעיל update() על ה-cookie הישן שלו (loginAt=1000) — אסור שישתחרר:
    expect(isTwoFactorVerifiedForLogin(new Date(3000), 1000)).toBe(false);
  });

  it("מאפשר login לגיטימי: אימות עבור אותו login (שוויון מדויק) משחרר", () => {
    expect(isTwoFactorVerifiedForLogin(new Date(1000), 1000)).toBe(true);
  });

  it("fail-secure: null/undefined (לא בוצע אימות) → לא משחרר", () => {
    expect(isTwoFactorVerifiedForLogin(null, 1000)).toBe(false);
    expect(isTwoFactorVerifiedForLogin(undefined, 1000)).toBe(false);
  });

  it("שוויון מדויק על ערכי epoch-ms אמיתיים (round-trip של DateTime ברמת ms)", () => {
    const loginAt = 1749567890123; // epoch-ms ריאלי
    expect(isTwoFactorVerifiedForLogin(new Date(loginAt), loginAt)).toBe(true);
    expect(isTwoFactorVerifiedForLogin(new Date(loginAt + 1), loginAt)).toBe(false);
  });
});
