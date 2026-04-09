"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientOnly } from "@/components/client-only";
import { Loader2 } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Activity,
  CreditCard,
  HardDrive,
  LogOut,
  Menu,
  X,
  Shield,
  ArrowRight,
  Ticket,
  ClipboardList,
  Brain,
  Bell,
  Megaphone,
  Settings,
  Search,
  Flag,
  BarChart3,
} from "lucide-react";

const adminNavGroups = [
  {
    label: "סקירה כללית",
    items: [
      { href: "/admin", label: "דשבורד", icon: LayoutDashboard },
      { href: "/admin/alerts", label: "התראות", icon: Bell },
    ],
  },
  {
    label: "ניהול משתמשים",
    items: [
      { href: "/admin/users", label: "משתמשים", icon: Users },
      { href: "/admin/trials", label: "תקופות ניסיון", icon: Activity },
    ],
  },
  {
    label: "כספים ותוכניות",
    items: [
      { href: "/admin/billing", label: "תשלומים ומנויים", icon: CreditCard },
      { href: "/admin/tier-settings", label: "תוכניות ומחירים", icon: Settings },
      { href: "/admin/coupons", label: "קופונים", icon: Ticket },
    ],
  },
  {
    label: "בינה מלאכותית",
    items: [
      { href: "/admin/ai-usage", label: "סקירת שימוש", icon: Brain, exact: true },
      { href: "/admin/ai-usage/settings", label: "הגדרות", icon: Settings },
      { href: "/admin/ai-usage/reports", label: "דוחות ואנליטיקס", icon: BarChart3 },
    ],
  },
  {
    label: "מערכת",
    items: [
      { href: "/admin/storage", label: "אחסון", icon: HardDrive },
      { href: "/admin/announcements", label: "הודעות", icon: Megaphone },
      { href: "/admin/questionnaires", label: "שאלונים", icon: ClipboardList },
      { href: "/admin/feature-flags", label: "ניהול פיצ'רים", icon: Flag },
      { href: "/admin/audit-log", label: "לוג פעולות", icon: Shield },
    ],
  },
];

interface SearchResult {
  id: string;
  type: string;
  typeLabel: string;
  title: string;
  subtitle: string;
  role: string;
  aiTier: string;
  isBlocked: boolean;
  href: string;
}

function AdminSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
        setOpen(data.results.length > 0);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(val: string) {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  }

  function handleSelect(result: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(result.href);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="חיפוש משתמשים..."
          className="bg-muted border-border pr-9 text-sm h-9"
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 right-0 left-0 z-50 bg-card border border-border rounded-lg shadow-xl overflow-hidden max-h-80 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              className="w-full text-right px-3 py-2.5 hover:bg-muted transition-colors flex items-center gap-3 border-b border-border last:border-0"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{r.title}</span>
                  {r.isBlocked && (
                    <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">חסום</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
              </div>
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
                {r.typeLabel}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { data: session, status } = useSession();

  // Show loading while checking session
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // This will be handled by middleware, but just in case
  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-foreground">
        <div className="text-center">
          <p className="mb-4">נדרשת התחברות</p>
          <Button asChild>
            <Link href="/login">התחבר</Link>
          </Button>
        </div>
      </div>
    );
  }

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
          {/* Logo */}
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/15 rounded-lg">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="font-bold text-lg">ממשק ניהול</h1>
                <p className="text-xs text-muted-foreground">לוח בקרה ראשי</p>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="px-4 pt-4">
            <AdminSearch />
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 pt-2 pb-4 overflow-y-auto">
            {adminNavGroups.map((group, groupIndex) => (
              <div key={group.label} className={cn(groupIndex > 0 && "mt-5")}>
                <p className="px-4 mb-2 text-[11px] font-semibold text-muted-foreground/60 tracking-wide">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = item.exact
                      ? pathname === item.href
                      : pathname === item.href ||
                        (item.href !== "/admin" && pathname.startsWith(item.href));

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
                </div>
              </div>
            ))}
          </nav>

          {/* User Info & Actions */}
          <div className="p-4 border-t border-border space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>מחובר כ:</p>
              <p className="text-foreground font-medium">{session?.user?.name || session?.user?.email}</p>
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
                  חזרה לדשבורד
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
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClientOnly
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </ClientOnly>
  );
}
