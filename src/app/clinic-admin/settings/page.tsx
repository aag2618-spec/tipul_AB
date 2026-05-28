import { redirect } from "next/navigation";

// C1: דף "הגדרות קליניקה" הוצא מהניווט (היה stub בבנייה). הגדרות הקליניקה
// מתבצעות כיום דרך אדמין הפלטפורמה. deep-link ישן ל-/clinic-admin/settings
// מנותב אוטומטית לסקירה כדי שלא יישאר בדף "דף בבנייה" ריק. כאשר תיבנה
// טופס עריכת פרטי עסק/לוגו — לבטל את ה-redirect ולהציג כאן את הטופס.
export const dynamic = "force-dynamic";

export default function ClinicSettingsPage(): never {
  redirect("/clinic-admin");
}
