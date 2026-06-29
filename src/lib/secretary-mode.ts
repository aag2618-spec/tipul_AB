import { cookies } from "next/headers";
import {
  loadScopeUser,
  isSecretaryTherapist,
  type ScopeUser,
} from "@/lib/scope";

// ============================================================================
// Secretary mode — מעבר "מסך מזכירות / מסך מטפל" למזכיר/ה שהוא/היא גם מטפל/ת
// ============================================================================
//
// מזכיר/ה עם User.secretaryIsTherapist=true מקבל/ת שני עולמות:
//   • "מצב מזכירה" (ברירת מחדל) — front-desk + /clinic-admin, תצוגה ארגונית,
//     תוכן קליני חסום (בדיוק כמו מזכירה רגילה).
//   • "מצב מטפל" — דשבורד טיפולי, רק המטופלים שלו/ה, גישה קלינית מלאה אליהם.
//
// המצב הנוכחי נשמר ב-cookie (פר-דפדפן), בדיוק כמו המתג "שלי/כל הקליניקה"
// (view-scope.ts). הכפתור עובר בין העמודים **וגם** מציב את ה-cookie.
//
// ⚠️ אינווריאנט PHI (קריטי): המעבר ל"מצב מטפל" ממומש ע"י **החלפת clinicRole
// ל-"THERAPIST"** בעותק ה-ScopeUser. כך כל ה-helpers ב-scope.ts (buildClientWhere,
// isSecretary, getSessionIncludeForRole, resolveTherapistId...) מתנהגים אוטומטית
// כמטפל/ת: scope מצומצם ל-therapistId=self **וגם** גישה קלינית מלאה — תמיד צמודים.
// לעולם לא ייתכן "ארגוני + קליני" כי שניהם נגזרים מאותו clinicRole.
//
// Fail-safe: route ששוכח להשתמש ב-loadScopeUserWithMode → המזכירה-מטפלת נשארת
// SECRETARY שם (ארגוני + חסום) = בטוח, לכל היותר UX לא-עקבי באותו מסך.
//
// ⚠️ שם ה-cookie חייב להתאים לקבוע ב-secretary-mode-toggle.tsx (צד לקוח).

export const SECRETARY_MODE_COOKIE = "mytipul_sec_mode";
export type SecretaryMode = "secretary" | "therapist";

/** קורא את מצב המזכיר/ה מה-cookie. ברירת מחדל: "secretary". */
export async function getSecretaryMode(): Promise<SecretaryMode> {
  const store = await cookies();
  return store.get(SECRETARY_MODE_COOKIE)?.value === "therapist"
    ? "therapist"
    : "secretary";
}

/**
 * מחיל את מצב המזכיר/ה על ScopeUser — pure, נוח ל-unit testing.
 *
 * מחזיר את אותו user ללא שינוי **אלא אם** המשתמש/ת מזכיר/ה-מטפל/ת
 * (isSecretaryTherapist) **וגם** mode="therapist". במקרה זה מחליף את clinicRole
 * ל-"THERAPIST" (וכן role מ-CLINIC_SECRETARY ל-USER, ומאפס secretaryPermissions)
 * כך שכל ה-helpers יתנהגו כמטפל/ת לכל דבר.
 *
 * מי שאינו/ה מזכיר/ה-מטפל/ת — תמיד מוחזר/ת ללא שינוי (התנהגות זהה לקודם).
 */
export function applySecretaryMode(
  user: ScopeUser,
  mode: SecretaryMode
): ScopeUser {
  if (mode !== "therapist") return user;
  if (!isSecretaryTherapist(user)) return user;
  return {
    ...user,
    clinicRole: "THERAPIST",
    // לנטרל גם את role=CLINIC_SECRETARY כדי ש-isSecretary יחזיר false במלואו.
    role: user.role === "CLINIC_SECRETARY" ? "USER" : user.role,
    // במצב מטפל אין משמעות להרשאות מזכירה — לנקות כדי למנוע בלבול.
    secretaryPermissions: null,
  };
}

/**
 * טוען ScopeUser מה-DB ומחיל עליו את מצב המזכיר/ה מה-cookie.
 * עוטף את loadScopeUser — להשתמש בו בכל מסך/route שצריך לכבד את המתג
 * (בעיקר עמודי הדשבורד הטיפולי וה-API שהם קוראים).
 *
 * ⚠️ קורא cookies() — תקף רק ב-request scope (Server Components / route handlers).
 * בהקשרים ללא בקשה (cron) יש להשתמש ב-loadScopeUser הרגיל.
 */
export async function loadScopeUserWithMode(userId: string): Promise<ScopeUser> {
  const user = await loadScopeUser(userId);
  // אופטימיזציה: רק מזכיר/ה-מטפל/ת מושפע/ת מה-cookie — אחרת לא קוראים אותו כלל.
  if (!isSecretaryTherapist(user)) return user;
  const mode = await getSecretaryMode();
  return applySecretaryMode(user, mode);
}
