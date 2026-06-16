// יומן הקליניקה מול היומן הרגיל — גידור שיפורי התצוגה
// ============================================================================
// שיפורי התצוגה ביומן (הסרת שם מטפל מהכרטיס, כפתורי פעולה קטנים יותר שמונעים
// חיתוך של "+", navLinks ללחיצה על יום, והפרדת box-shadow בין פגישות) אמורים לחול
// *רק* על יומן הקליניקה (תצוגה רב-מטפלית). היומן הרגיל — התצוגה "שלי" של
// בעל/ת הקליניקה ומטפל/ת עצמאי/ת — חייב להישאר בדיוק כפי שהיה.
//
// הפונקציה טהורה (בלי cookie/DOM) כדי שתהיה ניתנת לבדיקה; ה-caller (calendar
// page) מזרים את שלושת הקלטים שכבר מחושבים אצלו.

export type CalendarViewMode = "personal" | "clinic"; // תואם ל-ViewMode ב-view-scope.ts

/**
 * האם היומן מציג כעת את "יומן הקליניקה" (תצוגה רב-מטפלית) ולא את היומן הרגיל?
 *
 * כללים:
 *   • מטפל/ת עצמאי/ת (multiTherapist=false) → תמיד false.
 *   • מזכיר/ה → תמיד true (רואה את כל הקליניקה; אין לו/ה תצוגת "שלי", וה-cookie
 *     שלו/ה הוא "personal" כברירת מחדל ולכן אסור להסתמך עליו).
 *   • בעל/ת קליניקה → רק כשבחר/ה "כל הקליניקה" (viewMode==="clinic").
 */
export function isClinicCalendarView(params: {
  multiTherapist: boolean;
  viewMode: CalendarViewMode;
  isSecretary: boolean;
}): boolean {
  return params.multiTherapist && (params.viewMode === "clinic" || params.isSecretary);
}
