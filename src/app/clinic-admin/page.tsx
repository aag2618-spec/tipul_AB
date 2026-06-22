// דף הבית של ניהול הקליניקה — "מוקד היום".
//
// במקום לוח-מחוונים ניהולי (שעבר ל-/clinic-admin/overview = "מבט ניהולי"),
// בעל/ת הקליניקה מקבל/ת כאן מוקד עבודה יומי זהה למזכיר/ה: פגישות היום/מחר,
// "מה דורש טיפול" (בקשות ביטול + תשלומים פתוחים), ופעולות מהירות (שליחת
// תזכורות). זה מה שפותחים כל בוקר; הנתונים העסקיים נגישים בטאב "מבט ניהולי".
//
// מיחזור: ClinicFrontDesk הוא רכיב המוקד (=SecretaryHome) — scope-aware. לבעל/ת
// קליניקה buildSessionWhere מחזיר scope ארגוני ו-secretaryCan מחזיר את כל
// ההרשאות. אין תוכן קליני (SESSION_SELECT בלי topic/notes).
import { getServerSession } from "next-auth";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ClinicFrontDesk } from "@/components/dashboard/clinic-front-desk";
import { loadScopeUser, isClinicOwner } from "@/lib/scope";

// מכיל PHI scoped למשתמש (פגישות הקליניקה) — מונע cache leak בין משתמשים.
export const dynamic = "force-dynamic";

export default async function ClinicAdminHomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">טוען…</div>
    );
  }

  const scopeUser = await loadScopeUser(session.user.id);

  // owner-only — שכבת הגנה שנייה מעבר ל-layout (שכבר בודק /api/clinic-admin/me).
  // מזכיר/ה עם canTransferClient רואה את הלייאאוט אך לא את הפריט "מוקד היום"; אם
  // ינווט/תנווט לכאן ישירות — fallback ידידותי, בלי דליפת PHI ובלי קריסה.
  if (!isClinicOwner(scopeUser)) {
    return (
      <div className="max-w-2xl mx-auto" dir="rtl">
        <div className="rounded-lg border bg-card p-12 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
          <p className="font-medium">אזור זה מיועד לבעלי קליניקה.</p>
          <Button asChild>
            <Link href="/dashboard">חזרה לדשבורד</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <ClinicFrontDesk scopeUser={scopeUser} userName={session.user.name} />;
}
