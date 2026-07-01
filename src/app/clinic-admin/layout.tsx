"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { handleLogout } from "@/lib/logout";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ClientOnly } from "@/components/client-only";
import {
  Building2,
  LayoutDashboard,
  BarChart3,
  Users,
  UsersRound,
  ArrowLeftRight,
  UserMinus,
  Loader2,
  LogOut,
  ArrowRight,
  Menu,
  X,
  AlertCircle,
  MessagesSquare,
  ShieldCheck,
  Eye,
  CreditCard,
  DoorOpen,
  ClipboardList,
} from "lucide-react";

interface ClinicContext {
  organization: {
    id: string;
    name: string;
    // A1/A4: שדות החיוב מוחזרים מ-/api/clinic-admin/me רק לבעל/ת קליניקה.
    // למזכיר/ה עם canTransferClient הם נעדרים — לכן optional + render מותנה.
    aiTier?: string;
    subscriptionStatus?: string;
    // ownerIsTherapist=false → בעלים מנהל-בלבד (לא מטפל). משמש להסתרת הקישור
    // "לדשבורד הטיפולים" שמנתב אותו/ה חזרה לכאן ונתקע. נעדר למזכיר/ה.
    ownerIsTherapist?: boolean | null;
    pricingPlan?: { name: string };
  } | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    clinicRole: string | null;
    // דגלי הרשאת מזכירה — מ-/api/clinic-admin/me, לסינון פריטי התפריט.
    canTransferClient?: boolean;
    canAssignTasks?: boolean;
  };
  isAdmin: boolean;
}

// C1: /clinic-admin/billing ו-/clinic-admin/settings הם stubs ("דף בבנייה")
// בלי תוכן אמיתי — הוסרו מהניווט כדי לא להציע למשתמש לחיצה שתוביל ל-"under
// construction". פירוט החיוב כבר זמין בסקירה הראשית; הגדרות מתבצעות דרך
// אדמין הפלטפורמה. כשתשלים E3 (org subscription payment flow) — להחזיר
// את ה-billing. עד אז — עמודי ה-stub נשמרים כקבצים למקרה של deep-link.
// C2: הוסף "תהליכי עזיבה" — דשבורד שמרכז את כל ה-TherapistDepartures.
// Phase 4 follow-up: secretaryOnly=true → גם מזכיר/ה עם canTransferClient
// תראה את הפריט. שאר הפריטים — owner-only.
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  secretaryWithTransfer?: boolean;
  // נגיש למזכיר/ה עם canAssignTasks (מטלות צוות), במקביל ל-secretaryWithTransfer.
  secretaryWithAssign?: boolean;
};
const navItems: NavItem[] = [
  // "מוקד היום" (שורש /clinic-admin) ו"מבט ניהולי" (/clinic-admin/overview) —
  // שניהם owner-only (לא secretaryWithTransfer): המוקד מציג את פגישות כל
  // הקליניקה, והמבט הניהולי מציג billing/contract. מזכיר/ה עם canTransferClient
  // לא מגיעה לשורש /clinic-admin — היא נכנסת ישירות ל-/clinic-admin/transfer
  // דרך עריכת לקוח, או ל-/members/by-therapist מהנאב כשהיא כבר בלייאאוט.
  { href: "/clinic-admin", label: "מוקד היום", icon: LayoutDashboard, exact: true },
  // מבט ניהולי — לוח-המחוונים שהיה "סקירה כללית": KPIs, תמחור, SMS, הרכב צוות,
  // אזהרת קרדיט-בעזיבה. exact:true כדי לא להיות active במקביל לתת-מסלולים.
  { href: "/clinic-admin/overview", label: "מבט ניהולי", icon: BarChart3, exact: true },
  // Phase 4 — exact: true כדי שלא יואר במקביל ל-/members/by-therapist.
  { href: "/clinic-admin/members", label: "צוות הקליניקה", icon: Users, exact: true },
  // Phase 4 — תצוגה ייעודית: רשימת הלקוחות של כל מטפל. נמצא תחת
  // /members/by-therapist כדי לא לבלבל עם /members שמראה תפקידים.
  { href: "/clinic-admin/members/by-therapist", label: "מטופלים לפי מטפל", icon: UsersRound, secretaryWithTransfer: true },
  // מטלות צוות — הקצאת מטלות לעובדים ומעקב ביצוע. נגיש לבעלים, ולמזכיר/ה עם
  // canAssignTasks (secretaryWithAssign). השרת אוכף את ההרשאה ב-/api/clinic-admin/tasks.
  { href: "/clinic-admin/tasks", label: "מטלות צוות", icon: ClipboardList, secretaryWithAssign: true },
  // ניהול חדרי טיפול (שלב 2) — בעלת קליניקה בלבד (תשתית/קונפיגורציה).
  { href: "/clinic-admin/rooms", label: "ניהול חדרים", icon: DoorOpen },
  { href: "/clinic-admin/transfer", label: "העברת מטופל", icon: ArrowLeftRight, secretaryWithTransfer: true },
  { href: "/clinic-admin/departures", label: "תהליכי עזיבה", icon: UserMinus },
  // סליקה למטפלים — הסדר מסוף הסליקה לכל מטפל/ת (חשבון הקליניקה / חשבון עצמאי).
  // בעלת קליניקה בלבד (החלטת מדיניות/כסף — לא מזכירה), כמו "הגדרות צ׳אט".
  { href: "/clinic-admin/payments", label: "סליקה למטפלים", icon: CreditCard },
  // צ׳אט צוות — דף *בתוך* לייאאוט הקליניקה (/clinic-admin/team-chat), לא קישור
  // החוצה לדשבורד. כך מנהל/ת או מזכיר/ה שנמצא/ת כאן לא "נזרק/ת" לדשבורד המטפל.
  // secretaryWithTransfer=true → גם מזכיר/ה עם הרשאת העברה (שרואה את הלייאאוט)
  // מקבלת אותו. תג לא-נקראות דרך polling.
  { href: "/clinic-admin/team-chat", label: "צ׳אט צוות", icon: MessagesSquare, secretaryWithTransfer: true },
  // הגדרות צ׳אט — אישור המנהלת לצ׳אט בין מטפלים. בעלת קליניקה בלבד (ללא
  // secretaryWithTransfer) — זו החלטת מדיניות של המנהלת, לא של המזכירה.
  { href: "/clinic-admin/chat-settings", label: "הגדרות צ׳אט", icon: ShieldCheck },
  // מעקב שיחות מטפלים — קריאה בלבד. בעלת קליניקה בלבד (החלטת מוצר: המעקב הוא
  // של המנהלת; מזכירה לא רואה את התכתבויות המטפלים).
  { href: "/clinic-admin/chat-oversight", label: "מעקב שיחות מטפלים", icon: Eye },
];

function ClinicAdminContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ctx, setCtx] = useState<ClinicContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // reconnecting=true → השרת לא ענה בזמן (כנראה אתחול/deploy). במקום ספינר
  // אינסופי מציגים הודעה מרגיעה ומנסים שוב אוטומטית עד שהשרת חוזר.
  const [reconnecting, setReconnecting] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [tasksUnread, setTasksUnread] = useState(0);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        // timeout של 12ש': בלי זה, בקשה לשרת שמתאתחל (deploy) נתקעת לנצח —
        // וזה בדיוק הגלגל-טעינה-האינסופי שאילץ סגירה+פתיחה של הדפדפן.
        const res = await fetch("/api/clinic-admin/me", {
          signal: AbortSignal.timeout(12000),
        });
        if (cancelled) return;
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 403) {
          // Phase 4 follow-up: /api/clinic-admin/me כבר אישר גם מזכיר/ה עם
          // canTransferClient. אם בכל זאת חזר 403 — אין למשתמש כלל הרשאה
          // לאזור clinic-admin (לא בעלים, לא מזכירה עם הרשאת ההעברה).
          setError("אין לך הרשאה לגשת לאזור ניהול הקליניקה.");
          setLoading(false);
          return;
        }
        // 5xx / שגיאת שרת אחרת → מתייחסים כאל אתחול זמני ומנסים שוב.
        if (!res.ok) throw new Error("server-unavailable");
        const data: ClinicContext = await res.json();
        if (cancelled) return;
        if (!data.organization && !data.isAdmin) {
          setError("אינך משויך/ת לקליניקה. אם זו טעות, פנה/י לאדמין.");
          setLoading(false);
          return;
        }
        setCtx(data);
        setReconnecting(false);
        setLoading(false);
      } catch {
        if (cancelled) return;
        // timeout / שגיאת רשת / 5xx — סביר שהשרת מתאתחל. לא נתקעים: מציגים
        // "מתחבר מחדש" ומנסים שוב עם backoff (5ש'→10ש'→15ש') כדי לא להעמיס
        // על שרת שבאמת תקול. כשהשרת חוזר — הדף נטען לבד.
        setReconnecting(true);
        const delay = Math.min(5000 * 2 ** retryTick, 15000);
        retryTimer = setTimeout(() => setRetryTick((n) => n + 1), delay);
      }
    })();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [status, router, retryTick]);

  // תג הודעות שלא נקראו — צ׳אט צוות + חיוויי מטלות-צוות (הערות/ביצוע). polling
  // כמו ב-app-sidebar. רץ רק אחרי אימות (ctx). חיוויי המטלות נשלפים רק למי
  // שמנהל מטלות (בעלים / מזכיר-ה עם canAssignTasks) — אחרת ה-inbox מחזיר 403.
  useEffect(() => {
    if (!ctx) return;
    const canManageTasks =
      ctx.user.role === "CLINIC_OWNER" ||
      ctx.user.clinicRole === "OWNER" ||
      !!ctx.user.canAssignTasks;
    let active = true;
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/chat/unread-count");
        if (res.ok && active) {
          const data = await res.json();
          setChatUnread(data.unreadCount || 0);
        }
      } catch {
        // שקט — polling
      }
      if (!canManageTasks) return;
      try {
        const res = await fetch("/api/clinic-admin/tasks/inbox");
        if (res.ok && active) {
          const data = await res.json();
          setTasksUnread(data.unreadCount || 0);
        }
      } catch {
        // שקט — polling
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [ctx]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        {reconnecting && (
          <div className="text-center space-y-3 max-w-xs">
            <p className="text-sm text-muted-foreground">
              מתחבר לשרת... ייתכן שמתבצע עדכון למערכת. הדף ייפתח אוטומטית עוד רגע.
            </p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              נסה עכשיו
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6" dir="rtl">
        <div className="text-center max-w-md space-y-4">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
          <p className="font-medium">{error}</p>
          <Button asChild>
            <Link href="/dashboard">חזרה לדשבורד</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!ctx) return null;

  // בעלים מנהל-בלבד (לא מטפל/ת): /dashboard מנתב אותו/ה חזרה ל-/clinic-admin
  // (ראה dashboard/page.tsx → isNonTherapistManager). לכן הקישור "לדשבורד
  // הטיפולים" יוצר round-trip מיותר שנתקע בגלגל-טעינה — מסתירים אותו.
  // בעלים-מטפל/ת, מזכיר/ה (חוזר/ת ל-front-desk) ו-ADMIN — מקבלים אותו כרגיל.
  const isOwnerRole =
    ctx.user.role === "CLINIC_OWNER" || ctx.user.clinicRole === "OWNER";
  const isNonTherapistOwner =
    isOwnerRole && ctx.organization?.ownerIsTherapist === false;

  return (
    <div className="min-h-screen bg-muted/30 text-foreground" dir="rtl">
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 right-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-foreground hover:bg-muted"
        >
          {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-40 w-64 bg-card border-l border-border transform transition-transform duration-300 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo + clinic name */}
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/15 rounded-lg">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-base truncate">
                  {ctx.organization?.name || "ניהול קליניקה"}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {ctx.isAdmin && !ctx.organization ? "תצוגת אדמין" : "ניהול קליניקה"}
                </p>
              </div>
            </div>
            {ctx.organization?.pricingPlan?.name && (
              <div className="mt-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {ctx.organization.pricingPlan.name}
                </span>
                {ctx.organization.subscriptionStatus && (
                  <>
                    <span className="mx-2">·</span>
                    <span>{ctx.organization.subscriptionStatus}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Navigation — מזכיר/ה שרואה את ה-layout (יש לה canTransferClient
              שהשרת אישר ב-/api/clinic-admin/me) מקבלת רק פריטים שמסומנים
              secretaryWithTransfer. בעלים — רואה הכל. */}
          <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
            {navItems
              .filter((item) => {
                const isOwner =
                  ctx.user.role === "CLINIC_OWNER" ||
                  ctx.user.clinicRole === "OWNER";
                if (isOwner) return true;
                // מזכיר/ה — רק פריטים שההרשאה הספציפית שלה מתירה.
                if (item.secretaryWithTransfer && ctx.user.canTransferClient)
                  return true;
                if (item.secretaryWithAssign && ctx.user.canAssignTasks)
                  return true;
                return false;
              })
              .map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm",
                    isActive
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {item.href === "/clinic-admin/team-chat" && chatUnread > 0 && (
                    <span className="ms-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                      {chatUnread}
                    </span>
                  )}
                  {item.href === "/clinic-admin/tasks" && tasksUnread > 0 && (
                    <span className="ms-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                      {tasksUnread}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Info & Actions */}
          <div className="p-4 border-t border-border space-y-3">
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">מחובר כ:</p>
              <p className="font-medium truncate">
                {session?.user?.name || session?.user?.email}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {!isNonTherapistOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="justify-start text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Link href="/dashboard">
                    <ArrowRight className="ml-2 h-4 w-4" />
                    לדשבורד הטיפולים
                  </Link>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleLogout()}
                className="justify-start text-muted-foreground hover:text-red-400 hover:bg-muted"
              >
                <LogOut className="ml-2 h-4 w-4" />
                התנתק
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="lg:mr-64 min-h-screen">
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

export default function ClinicAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnly
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ClinicAdminContent>{children}</ClinicAdminContent>
    </ClientOnly>
  );
}
