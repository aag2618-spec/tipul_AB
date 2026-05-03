import Link from "next/link";
import { AppLogo } from "@/components/app-logo";

// Stage 6-A.2 — פוטר ציבורי עם copyright מלא ולינקים למסמכים המשפטיים.
// משתמשים בו ב-landing page וב-/legal/* וב-/p/*.
// הכרזת זכויות היוצרים נדרשת כראיה לתביעה במקרה הפרת קניין רוחני
// (חוק זכות יוצרים, התשס"ח-2007).
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t mt-8 py-8 bg-background" dir="rtl">
      <div className="container mx-auto px-4 flex flex-col items-center gap-4 text-sm text-muted-foreground text-center">
        <AppLogo className="w-[120px] h-auto opacity-80" />
        <p>
          © {year} MyTipul — מערכת ניהול לפרקטיקה טיפולית.{" "}
          <span className="whitespace-nowrap">כל הזכויות שמורות.</span>
        </p>
        <nav
          aria-label="קישורים משפטיים"
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs"
        >
          <Link href="/legal/terms" className="hover:underline">
            תנאי שימוש
          </Link>
          <span aria-hidden="true">•</span>
          <Link href="/legal/privacy" className="hover:underline">
            מדיניות פרטיות
          </Link>
          <span aria-hidden="true">•</span>
          <Link href="/legal/dpa" className="hover:underline">
            הסכם עיבוד נתונים (DPA)
          </Link>
          <span aria-hidden="true">•</span>
          <Link href="/legal/patient-notice" className="hover:underline">
            הודעת מטופל
          </Link>
        </nav>
        <p className="text-[11px] leading-relaxed max-w-2xl">
          השימוש במערכת כפוף לתנאי השימוש ולמדיניות הפרטיות. אסור להעתיק, לשכפל,
          לבצע הנדסה לאחור, לפרק, לערוך, לשנות, להפיץ, לפרסם או למכור חלק כלשהו
          מהמערכת או מהקוד שלה. הפרת תנאים אלה עלולה לגרור הליכים אזרחיים
          ופליליים על-פי חוק זכות יוצרים, התשס&quot;ח-2007.
        </p>
      </div>
    </footer>
  );
}
