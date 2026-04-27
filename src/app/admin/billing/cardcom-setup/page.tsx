// src/app/admin/billing/cardcom-setup/page.tsx
// בחירת מצב המסוף הגלובלי של ADMIN — Sandbox / Production.
// Credentials של פרודקשן נשמרים ב-env vars (לא ב-DB), ההגדרה הזו רק בוחרת מה לקרוא.

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getSiteSetting } from "@/lib/site-settings";
import { CardcomSetupForm } from "./cardcom-setup-form";

export const dynamic = "force-dynamic";

export default async function CardcomSetupPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (!hasPermission(session.user.role, "settings.billing_provider")) redirect("/admin");

  const mode = ((await getSiteSetting<string>("admin_cardcom_mode")) ?? "sandbox") as "sandbox" | "production";

  // האם ה-credentials של production הוגדרו ב-env? לא חושפים אותם — רק מציגים סטטוס.
  const productionConfigured =
    !!process.env.CARDCOM_ADMIN_TERMINAL_NUMBER && !!process.env.CARDCOM_ADMIN_API_NAME;

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">מסוף סליקה — Cardcom</h1>
      <p className="text-sm text-gray-600 mb-6">
        מסוף הסליקה הגלובלי של MyTipul משמש לגביית דמי מנוי ממטפלים. פרטי הגישה (TerminalNumber, ApiName, ApiPassword)
        נשמרים במשתני סביבה (env vars) ולא בבסיס הנתונים — מכאן רק בוחרים בין סביבת בדיקה (Sandbox) לסביבת ייצור.
      </p>

      <CardcomSetupForm initialMode={mode} productionConfigured={productionConfigured} />
    </div>
  );
}
