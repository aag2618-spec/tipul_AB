import { redirect } from "next/navigation";

// C1: דף "חיוב ומחיר" הוצא מהניווט (היה stub בבנייה). פירוט המחיר
// החודשי וההנחות הזמין מלא בעמוד הסקירה הראשית של ניהול הקליניקה.
// deep-link ישן ל-/clinic-admin/billing מנותב אוטומטית לסקירה כדי שלא
// יישאר בדף "דף בבנייה" ריק. כאשר E3 יסתיים (org subscription payment
// flow) — לבטל את ה-redirect ולהציג כאן את היסטוריית החיוב המלאה.
export const dynamic = "force-dynamic";

export default function ClinicBillingPage(): never {
  redirect("/clinic-admin");
}
