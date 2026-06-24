// src/app/admin/leads/page.tsx
// פניות "צרו קשר" שהתקבלו מדף הנחיתה (מודל Lead). ADMIN בלבד, read-only.
// קריאה ישירה מ-Prisma (Server Component). עוטף ב-try/catch כדי שאם הטבלה
// עדיין לא נוצרה בייצור (prisma db push) — יוצג הסבר במקום קריסה.

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

interface LeadRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organization: string | null;
  message: string;
  status: string;
  createdAt: Date;
}

export default async function AdminLeadsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/admin");

  let leads: LeadRow[] = [];
  let tableMissing = false;
  try {
    leads = await prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
    });
  } catch (err) {
    tableMissing = true;
    logger.error("[admin/leads] query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/15 rounded-lg">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">פניות מדף הנחיתה</h1>
          <p className="text-sm text-muted-foreground">
            פניות &quot;צרו קשר&quot; שהתקבלו מדף הנחיתה (בעיקר פתיחת קליניקה).
          </p>
        </div>
      </div>

      {tableMissing ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800 text-sm leading-relaxed">
          טבלת הפניות עדיין לא קיימת במסד הנתונים. יש להריץ <code>prisma db push</code>{" "}
          בייצור (ה-script <code>start:prod</code> מריץ זאת אוטומטית בכל deploy — ייתכן
          שצריך deploy מחדש).
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          אין פניות עדיין. כשמבקר ימלא את טופס &quot;צרו קשר&quot; בדף הנחיתה — הפנייה תופיע כאן.
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3">{leads.length} פניות</p>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 font-medium text-right whitespace-nowrap">תאריך</th>
                  <th className="p-3 font-medium text-right">שם</th>
                  <th className="p-3 font-medium text-right">אימייל</th>
                  <th className="p-3 font-medium text-right whitespace-nowrap">טלפון</th>
                  <th className="p-3 font-medium text-right">ארגון</th>
                  <th className="p-3 font-medium text-right">הודעה</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 align-top">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {new Date(l.createdAt).toLocaleString("he-IL")}
                    </td>
                    <td className="p-3 font-medium">{l.name}</td>
                    <td className="p-3 text-primary">{l.email}</td>
                    <td className="p-3 whitespace-nowrap">{l.phone || "—"}</td>
                    <td className="p-3">{l.organization || "—"}</td>
                    <td className="p-3 max-w-sm whitespace-pre-wrap break-words">{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
