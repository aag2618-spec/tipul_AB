"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  Users,
  Activity,
  CreditCard,
  HardDrive,
  Shield,
  ArrowLeft,
  Ticket,
  FileCheck,
  FlaskConical,
} from "lucide-react";

interface AdminSidebarProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: "USER" | "ADMIN";
  };
}

const adminNavItems = [
  {
    title: "דשבורד ניהול",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "ניהול משתמשים",
    href: "/admin/users",
    icon: Users,
  },
  {
    title: "קופונים",
    href: "/admin/coupons",
    icon: Ticket,
  },
  {
    title: "שימוש ב-API",
    href: "/admin/api-usage",
    icon: Activity,
  },
  {
    title: "תקופת ניסיון",
    href: "/admin/trials",
    icon: FlaskConical,
  },
  {
    title: "תשלומים ומנויים",
    href: "/admin/billing",
    icon: CreditCard,
  },
  {
    title: "אישורי תנאים",
    href: "/admin/terms",
    icon: FileCheck,
  },
  {
    title: "אחסון קבצים",
    href: "/admin/storage",
    icon: HardDrive,
  },
];

export function AdminSidebar({ user }: AdminSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname.startsWith(href);
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "מ";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2);
  };

  return (
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border bg-red-950/20">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/admin" className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white">
                  <Shield className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-lg text-red-100">ניהול מערכת</span>
                  <span className="text-xs text-red-300/70">Admin Panel</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-red-300/70">ניהול</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-red-300/70">חזרה לאתר</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="חזרה לדשבורד">
                  <Link href="/dashboard">
                    <ArrowLeft className="h-4 w-4" />
                    <span>דשבורד משתמש</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border bg-red-950/20">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8 ring-2 ring-red-500/30">
                  <AvatarImage src={user.image || undefined} alt={user.name || "Admin"} />
                  <AvatarFallback className="bg-red-600/20 text-red-100 text-sm">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate font-medium text-sm text-red-100">{user.name}</span>
                  <span className="truncate text-xs text-red-300/70">מנהל מערכת</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

