"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  Mic,
  CreditCard,
  FolderOpen,
  BarChart3,
  Settings,
  Bell,
  ListTodo,
  Leaf,
  Shield,
  XCircle,
  ClipboardList,
  FileSignature,
  Building2,
  MessageSquare,
  Mail,
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
];

const clinicalItems = [
  {
    title: "הקלטות",
    href: "/dashboard/recordings",
    icon: Mic,
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
    title: "תשלומים",
    href: "/dashboard/payments",
    icon: CreditCard,
  },
  {
    title: "היסטוריית תקשורת",
    href: "/dashboard/communications",
    icon: Mail,
  },
  {
    title: "בקשות ביטול",
    href: "/dashboard/cancellation-requests",
    icon: XCircle,
    hasBadge: true,
  },
  {
    title: "דוחות",
    href: "/dashboard/reports",
    icon: BarChart3,
  },
];

const settingsItems = [
  {
    title: "התראות",
    href: "/dashboard/settings/notifications",
    icon: Bell,
  },
  {
    title: "תזכורות SMS",
    href: "/dashboard/settings/sms",
    icon: MessageSquare,
  },
  {
    title: "קופות חולים",
    href: "/dashboard/settings/health-insurers",
    icon: Building2,
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
  const isAdmin = session?.user?.role === "ADMIN";
  const [pendingCancellations, setPendingCancellations] = useState(0);

  // Fetch pending cancellation requests count
  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const res = await fetch('/api/cancellation-requests?status=PENDING&countOnly=true');
        if (res.ok) {
          const data = await res.json();
          setPendingCancellations(data.count || 0);
        }
      } catch (error) {
        console.error('Error fetching pending cancellations:', error);
      }
    };

    fetchPendingCount();
    // Refresh every minute
    const interval = setInterval(fetchPendingCount, 60000);
    return () => clearInterval(interval);
  }, []);

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
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard" className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Leaf className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-lg">טיפול</span>
                  <span className="text-xs text-muted-foreground">ניהול פרקטיקה</span>
                </div>
              </Link>
            </SidebarMenuButton>
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
          <SidebarGroupLabel>ניהול עסקי</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {businessItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href} className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </div>
                      {item.hasBadge && pendingCancellations > 0 && (
                        <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs">
                          {pendingCancellations}
                        </Badge>
                      )}
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
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate font-medium text-sm">{user.name}</span>
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













