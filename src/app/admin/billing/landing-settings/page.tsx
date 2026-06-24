// src/app/admin/billing/landing-settings/page.tsx
// הגדרות התצוגה של דף הנחיתה הציבורי — מחיר מסלול "מטפל פרטי", טקסט מבצע,
// ומתג ניראות. נשמר ב-SiteSetting ונקרא ב-src/app/page.tsx.

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getSiteSettings } from "@/lib/site-settings";
import { LandingSettingsForm, type LandingSettings } from "./landing-settings-form";

export const dynamic = "force-dynamic";

export default async function LandingSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!hasPermission(session.user.role, "settings.billing_provider")) {
    redirect("/admin");
  }

  const s = await getSiteSettings([
    "landing_private_price",
    "landing_price_note",
    "landing_price_visible",
  ]);
  const initial: LandingSettings = {
    privatePrice: (s.landing_private_price as string | undefined) ?? "",
    priceNote: (s.landing_price_note as string | undefined) ?? "",
    priceVisible: (s.landing_price_visible as boolean | undefined) ?? false,
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">הגדרות דף הנחיתה</h1>
      <p className="text-sm text-gray-600 mb-6">
        המחיר והטקסט שמוצגים במסלול &quot;מטפל פרטי&quot; בדף הנחיתה הציבורי. כל עוד
        &quot;הצג מחיר&quot; כבוי — בדף יוצג &quot;פנו לפרטים&quot; במקום מספר, כך שהדף
        תקין גם לפני שנקבע מחיר סופי.
      </p>
      <LandingSettingsForm initial={initial} />
    </div>
  );
}
