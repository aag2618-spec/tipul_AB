"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  ArrowLeft,
  Ticket,
  ClipboardList,
  Brain,
} from "lucide-react";

const adminNavItems = [
  {
    href: "/admin",
    label: "דשבורד",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/ai-dashboard",
    label: "ניהול AI ומשתמשים",
    icon: Brain,
  },
  {
    href: "/admin/questionnaires",
    label: "שאלונים",
    icon: ClipboardList,
  },
  {
    href: "/admin/coupons",
    label: "קופונים",
    icon: Ticket,
  },
  {
    href: "/admin/api-usage",
    label: "שימוש ב-API",
    icon: Activity,
  },
  {
    href: "/admin/billing",
    label: "תשלומים",
    icon: CreditCard,
  },
  {
    href: "/admin/storage",
    label: "אחסון",
    icon: HardDrive,
  },
];

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { data: session, status } = useSession();

  // Show loading while checking session
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  // This will be handled by middleware, but just in case
  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
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
    <div className="min-h-screen bg-slate-950 text-white" dir="rtl">
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 right-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-white hover:bg-slate-800"
        >
          {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-40 w-64 bg-slate-900 border-l border-slate-800 transform transition-transform duration-300 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <Shield className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <h1 className="font-bold text-lg">ממשק ניהול</h1>
                <p className="text-xs text-slate-400">Admin Panel</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {adminNavItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== "/admin" && pathname.startsWith(item.href));
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                    isActive
                      ? "bg-amber-500/20 text-amber-500"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Info & Actions */}
          <div className="p-4 border-t border-slate-800 space-y-4">
            <div className="text-sm text-slate-400">
              <p>מחובר כ:</p>
              <p className="text-white font-medium">{session?.user?.name || session?.user?.email}</p>
            </div>
            
            <div className="flex flex-col gap-2">
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="justify-start text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <Link href="/dashboard">
                  <ArrowLeft className="ml-2 h-4 w-4" />
                  חזרה לדשבורד
                </Link>
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="justify-start text-slate-400 hover:text-red-400 hover:bg-slate-800"
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
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      }
    >
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </ClientOnly>
  );
}
