import { cookies } from "next/headers";
import { isClinicOwner, type ScopeUser } from "@/lib/scope";

// ============================================================================
// View scope — מתג גלובלי "שלי / כל הקליניקה"
// ============================================================================
//
// בעל/ת קליניקה שהוא/היא גם מטפל/ת יכול/ה לבחור אם לראות בכל המערכת רק את
// הנתונים שלו/ה ("שלי") או את כל הקליניקה ("כל הקליניקה"). הבחירה נשמרת ב-cookie
// (פר-דפדפן) כדי שתחול אוטומטית בכל מסך. ברירת מחדל: "שלי".
//
// השרת הוא מקור-האמת: כל מסך/route קורא ל-shouldScopePersonal ומעביר personalOnly
// ל-build*Where (ב-scope.ts). למשתמשים שאינם בעלי קליניקה — תמיד false (ה-scope
// שלהם לא משתנה כלל).
//
// ⚠️ שם ה-cookie חייב להתאים לקבוע ב-view-scope-toggle.tsx (שמגדיר אותו בצד הלקוח).

export const VIEW_MODE_COOKIE = "mytipul_view";
export type ViewMode = "personal" | "clinic";

/** קורא את מצב התצוגה הגלובלי מה-cookie. ברירת מחדל: "personal" (אישי). */
export async function getViewMode(): Promise<ViewMode> {
  const store = await cookies();
  return store.get(VIEW_MODE_COOKIE)?.value === "clinic" ? "clinic" : "personal";
}

/**
 * האם להחיל תצוגה אישית (personalOnly) על המשתמש הנוכחי, לפי המתג הגלובלי.
 * חל אך ורק על בעל/ת קליניקה (היחיד/ה שרואה כברירת מחדל את כל הקליניקה ולכן
 * יכול/ה לצמצם ל"שלי"). לכל שאר התפקידים (מטפל/ת, מזכיר/ה, עצמאי/ת) → false,
 * וה-scope שלהם זהה לחלוטין להתנהגות הקודמת.
 */
export async function shouldScopePersonal(scopeUser: ScopeUser): Promise<boolean> {
  if (!isClinicOwner(scopeUser)) return false;
  return (await getViewMode()) === "personal";
}
