"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
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
import { UserTierBadge } from "@/components/user-tier-badge";
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  FolderOpen,
  BarChart3,
  Settings,
  ListTodo,
  Shield,
  ClipboardList,
  FileSignature,
  Mail,
  Brain,
  CreditCard,
} from "lucide-react";

interface AppSidebarProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

const mainNavItems = [
  {
    title: "דשבורד",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "יומן",
    href: "/dashboard/calendar",
    icon: Calendar,
  },
  {
    title: "מטופלים",
    href: "/dashboard/clients",
    icon: Users,
  },
  {
    title: "פגישות",
    href: "/dashboard/sessions",
    icon: FileText,
  },
  {
    title: "משימות",
    href: "/dashboard/tasks",
    icon: ListTodo,
  },
  {
    title: "הודעות",
    href: "/dashboard/communications",
    icon: Mail,
  },
];

const clinicalItems = [
  {
    title: "הכנה לפגישה AI",
    href: "/dashboard/ai-prep",
    icon: Brain,
  },
  {
    title: "שאלונים",
    href: "/dashboard/questionnaires",
    icon: ClipboardList,
  },
  {
    title: "טפסי הסכמה",
    href: "/dashboard/consent-forms",
    icon: FileSignature,
  },
  {
    title: "מסמכים",
    href: "/dashboard/documents",
    icon: FolderOpen,
  },
];

const businessItems = [
  {
    title: "דוחות",
    href: "/dashboard/reports",
    icon: BarChart3,
  },
  {
    title: "קבלות",
    href: "/dashboard/receipts",
    icon: FileText,
  },
];

const settingsItems = [
  {
    title: "הגדרות AI",
    href: "/dashboard/settings/ai-assistant",
    icon: Brain,
  },
  {
    title: "זימון עצמי",
    href: "/dashboard/settings/booking",
    icon: Calendar,
  },
  {
    title: "מנוי וחיוב",
    href: "/dashboard/settings/billing",
    icon: CreditCard,
  },
  {
    title: "הגדרות כלליות",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
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
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link href="/dashboard" className="flex items-center justify-center py-3 px-2 hover:opacity-80 transition-opacity">
              <Image
                src="/logo.png"
                alt="MyTipul"
                width={160}
                height={80}
                className="object-contain"
                priority
              />
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>ניווט ראשי</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
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

        {/* Clinical Tools */}
        <SidebarGroup>
          <SidebarGroupLabel>כלים קליניים</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {clinicalItems.map((item) => (
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

        {/* Business Management */}
        <SidebarGroup>
          <SidebarGroupLabel>דוחות</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {businessItems.map((item) => (
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

        {/* Settings */}
        <SidebarGroup>
          <SidebarGroupLabel>הגדרות</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
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

        {/* Admin Section - Only visible to admins */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-amber-600">מנהל</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/admin")}
                    tooltip="ניהול מערכת"
                  >
                    <Link href="/admin" className="text-amber-600 hover:text-amber-500">
                      <Shield className="h-4 w-4" />
                      <span>ניהול מערכת</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/dashboard/settings/profile" className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-sm">{user.name}</span>
                    <UserTierBadge />
                  </div>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}













