// src/app/admin/billing/business-settings/page.tsx
// הגדרות עסק של ADMIN — סוג עסק (פטור/מורשה), פרטים, מע"מ, לוגו

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getAdminBusinessProfile } from "@/lib/site-settings";
import { BusinessSettingsForm } from "./business-settings-form";

export const dynamic = "force-dynamic";

export default async function BusinessSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!hasPermission(session.user.role, "settings.billing_provider")) {
    redirect("/admin");
  }

  const profile = await getAdminBusinessProfile();

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">הגדרות עסק</h1>
      <p className="text-sm text-gray-600 mb-6">
        הגדרות אלו משמשות להפקת קבלות באמצעות Cardcom. שינוי סוג עסק (פטור↔מורשה) משפיע על מסמכים חדשים בלבד —
        מסמכים שכבר הופקו לא משתנים (דרישה חוקית).
      </p>
      <BusinessSettingsForm initialProfile={profile} />
    </div>
  );
}
