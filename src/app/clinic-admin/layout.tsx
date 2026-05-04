"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ClientOnly } from "@/components/client-only";
import {
  Building2,
  LayoutDashboard,
  Users,
  UserPlus,
  ArrowLeftRight,
  Receipt,
  Settings,
  Loader2,
  LogOut,
  ArrowRight,
  Menu,
  X,
  AlertCircle,
} from "lucide-react";

interface ClinicContext {
  organization: {
    id: string;
    name: string;
    aiTier: string;
    subscriptionStatus: string;
    pricingPlan: { name: string };
  } | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    clinicRole: string | null;
  };
  isAdmin: boolean;
}

const navItems = [
  { href: "/clinic-admin", label: "סקירה כללית", icon: LayoutDashboard, exact: true },
  { href: "/clinic-admin/members", label: "חברי קליניקה", icon: Users },
  { href: "/clinic-admin/invitations", label: "הזמנות פעילות", icon: UserPlus },
  { href: "/clinic-admin/transfer", label: "העברת מטופל", icon: ArrowLeftRight },
  { href: "/clinic-admin/billing", label: "חיוב ומחיר", icon: Receipt },
  { href: "/clinic-admin/settings", label: "הגדרות קליניקה", icon: Settings },
];

function ClinicAdminContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ctx, setCtx] = useState<ClinicContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/clinic-admin/me");
        if (!res.ok) {
          if (res.status === 403) {
            setError("הגישה לדף זה זמינה רק לבעלי/ות קליניקה.");
          } else {
            setError("שגיאה בטעינת פרטי הקליניקה.");
          }
          return;
        }
        const data: ClinicContext = await res.json();
        if (!data.organization && !data.isAdmin) {
          setError("אינך משויך/ת לקליניקה. אם זו טעות, פנה/י לאדמין.");
          return;
        }
        setCtx(data);
      } catch {
        setError("שגיאת רשת בטעינת פרטי הקליניקה.");
      } finally {
        setLoading(false);
      }
    })();
  }, [status, router]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
            {ctx.organization && (
              <div className="mt-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {ctx.organization.pricingPlan.name}
                </span>
                <span className="mx-2">·</span>
                <span>{ctx.organization.subscriptionStatus}</span>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
            {navItems.map((item) => {
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/login" })}
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
