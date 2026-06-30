import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { loadScopeUser, canManageStaffTasks } from "@/lib/scope";
import { TasksManager } from "@/components/clinic-admin/tasks-manager";

// מכיל נתוני מטלות scoped למשתמש — מונע cache leak בין משתמשים.
export const dynamic = "force-dynamic";

// מסך ניהול מטלות הצוות *בתוך* מעטפת הדשבורד של המזכיר/ה — מקביל ל-
// /clinic-admin/tasks (אותו רכיב TasksManager, אותם נתיבי /api/clinic-admin/tasks).
// כך מזכיר/ה עם canAssignTasks מנהלת מטלות בלי להיזרק למעטפת ניהול הקליניקה
// (שנראית כמו חשבון המנהלת). הבעלים/מנהלת ממשיכ/ה לראות הכל ב-/clinic-admin/tasks
// וגם כאן — הסקופ ב-API זהה (בעלים=כל הארגון, מזכיר/ה=מה שהקצתה), כך שהמעקב
// של המנהלת לא נפגע.
export default async function DashboardStaffTasksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const scopeUser = await loadScopeUser(session.user.id);

  // שער — בעלים או מזכיר/ה עם canAssignTasks (defense in depth מעבר ל-API).
  // מזכיר/ה ללא ההרשאה שניגשה ישירות לכתובת — fallback ידידותי, בלי קריסה.
  if (!canManageStaffTasks(scopeUser)) {
    return (
      <div className="max-w-2xl mx-auto" dir="rtl">
        <div className="rounded-lg border bg-card p-12 text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
          <p className="font-medium">
            ניהול מטלות צוות זמין לבעלי קליניקה ולמזכיר/ה עם הרשאת הקצאת מטלות.
          </p>
          <Button asChild>
            <Link href="/dashboard">חזרה לדשבורד</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <TasksManager />;
}
