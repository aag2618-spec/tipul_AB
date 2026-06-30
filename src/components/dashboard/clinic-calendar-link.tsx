"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

// ⚠️ חייב להתאים ל-VIEW_MODE_COOKIE ב-src/lib/view-scope.ts (השרת קורא את אותו cookie).
const VIEW_MODE_COOKIE = "mytipul_view";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * קישור ליומן מתוך מוקד הקליניקה (front-desk של בעל/ת קליניקה ב-/clinic-admin).
 *
 * הבעיה שזה פותר: היומן (/dashboard/calendar) בוחר בין "יומן אישי" ל"יומן
 * הקליניקה" לפי המתג הגלובלי "שלי / כל הקליניקה" (cookie mytipul_view), שברירת
 * המחדל שלו לבעל/ת קליניקה היא "שלי". לכן לחיצה על "ליומן" ממוקד הקליניקה —
 * שמראה נתונים כלל-קליניקיים — הביאה את הבעלים ליומן האישי במקום ליומן הקליניקה
 * הרב-מטפלי (צבעים לפי מטפל), בשונה מהמזכיר/ה שתמיד רואה את הקליניקה.
 *
 * הפתרון: סימון התצוגה כ"כל הקליניקה" *לפני* הניווט (כתיבת ה-cookie ב-onClick,
 * סינכרונית, לפני שה-Link מנווט). כך כבר ב-render הראשון של היומן גם הנתונים
 * (השרת קורא את ה-cookie) וגם ה-UI נטענים בהיקף הקליניקה. ה-cookie חסר השפעה על
 * מזכיר/ה (התצוגה שלה מבוססת-תפקיד), ולכן הרכיב בטוח לשימוש משותף בשני ההקשרים.
 *
 * מעביר את כל ה-props ל-Link כדי לעבוד גם בתוך <Button asChild> (Radix Slot
 * מזריק className/ref/onClick) וגם ככקישור טקסט עצמאי עם className משלו.
 */
export function ClinicCalendarLink({
  onClick,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        document.cookie = `${VIEW_MODE_COOKIE}=clinic; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
        onClick?.(e);
      }}
    />
  );
}
