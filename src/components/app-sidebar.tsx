"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { UserTierBadge } from "@/components/user-tier-badge";
import { AppLogo } from "@/components/app-logo";
import { ViewScopeToggle } from "@/components/view-scope-toggle";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { cn } from "@/lib/utils";
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
  CreditCard,
  BookOpen,
  Headphones,
  Building2,
  FileCheck,
  MessagesSquare,
  ArrowLeftRight,
  Clock,
  Receipt,
  ChevronDown,
  UserMinus,
  type LucideIcon,
} from "lucide-react";

interface AppSidebarProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  // מצב התצוגה הגלובלי, נקרא בשרת (layout) ומועבר ל-toggle כדי למנוע אי-התאמת hydration.
  initialViewMode?: "personal" | "clinic";
}

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  // ספירת badge (למשל הודעות שלא נקראו בצ׳אט צוות). 0/undefined = ללא badge.
  badge?: number;
};

type NavGroup = {
  key: string;
  // כותרת הקבוצה. ללא כותרת = קבוצת העוגנים העליונה.
  label?: string;
  // האם הקבוצה מתקפלת (אקורדיון) — מקופלת כברירת מחדל, נפתחת בלחיצה.
  collapsible?: boolean;
  items: NavItem[];
};

// עוגנים — שלוש הכניסות השכיחות ביותר. ללא כותרת קבוצה: הן ה"בית" וצריכות
// להיות תמיד בהישג יד מיידי.
const anchorItems: NavItem[] = [
  { title: "דשבורד", href: "/dashboard", icon: LayoutDashboard },
  { title: "יומן", href: "/dashboard/calendar", icon: Calendar },
  { title: "מטופלים", href: "/dashboard/clients", icon: Users },
];

// ניהול קליני — כל מה שסובב את הפגישה עצמה (העבודה היומיומית במטופלים קיימים).
const clinicalFlowItems: NavItem[] = [
  { title: "פגישות", href: "/dashboard/sessions", icon: FileText },
  { title: "פגישות לסיכום", href: "/dashboard/tasks", icon: ListTodo },
  { title: "דפי עבודה", href: "/dashboard/worksheets", icon: BookOpen },
  { title: "שאלונים", href: "/dashboard/questionnaires", icon: ClipboardList },
  { title: "מסמכים", href: "/dashboard/documents", icon: FolderOpen },
];

// כספים וגבייה — כל הכסף במקום אחד.
const financeItems: NavItem[] = [
  { title: "תשלומים", href: "/dashboard/payments", icon: CreditCard },
  { title: "קבלות", href: "/dashboard/receipts", icon: Receipt },
  { title: "התחייבויות קופ\"ח", href: "/dashboard/commitments", icon: FileCheck },
];

// קליטת מטופלים — אירוע נדיר יחסית, לכן מקופל כברירת מחדל.
const intakeItems: NavItem[] = [
  { title: "רשימת המתנה", href: "/dashboard/waitlist", icon: Clock },
  { title: "טפסי הסכמה", href: "/dashboard/consent-forms", icon: FileSignature },
];

// דוחות ובקרה — מקופל.
const reportsItems: NavItem[] = [
  { title: "דוחות", href: "/dashboard/reports", icon: BarChart3 },
];

// הגדרות מערכת — מקופל.
const settingsItems: NavItem[] = [
  { title: "זימון עצמי", href: "/dashboard/settings/booking", icon: Calendar },
  { title: "מנוי וחיוב", href: "/dashboard/settings/billing", icon: CreditCard },
  { title: "הגדרות כלליות", href: "/dashboard/settings", icon: Settings },
];

// תמיכה ושירות — מקופל.
const supportItems: NavItem[] = [
  { title: "פניות ותמיכה", href: "/dashboard/support", icon: Headphones },
];

export function AppSidebar({ user, initialViewMode = "personal" }: AppSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";
  const isClinicOwner =
    session?.user?.role === "CLINIC_OWNER" ||
    session?.user?.role === "ADMIN" ||
    session?.user?.clinicRole === "OWNER";

  // מתג "שלי / כל הקליניקה" — רק לבעל/ת קליניקה ממש (לא ADMIN גלובלי), בהתאמה
  // ל-isClinicOwner שבשרת (scope.ts). שאר התפקידים לא רואים את המתג.
  const showViewToggle =
    session?.user?.clinicRole === "OWNER" || session?.user?.role === "CLINIC_OWNER";

  // צ׳אט צוות — זמין לכל חברי הקליניקה (מנהלת / מזכירה / מטפל).
  const isChatMember =
    session?.user?.clinicRole === "OWNER" ||
    session?.user?.clinicRole === "SECRETARY" ||
    session?.user?.clinicRole === "THERAPIST" ||
    session?.user?.role === "CLINIC_OWNER" ||
    session?.user?.role === "CLINIC_SECRETARY";

  // מזכיר/ה — תפריט מותאם (front-desk) במקום תפריט המטפל. שאר התפקידים
  // (מטפל עצמאי / בעלים / מטפל בקליניקה) — אפס שינוי.
  const isSecretaryUser =
    session?.user?.clinicRole === "SECRETARY" ||
    session?.user?.role === "CLINIC_SECRETARY";

  // מטפל/ת חבר/ה בקליניקה (לא בעלים, לא מזכירה, לא עצמאי/ת) — רק הם/ן יכולים/ות
  // ליזום תהליך עזיבה דרך /dashboard/clinic/leave (תואם לאכיפת השרת ב-route).
  const isClinicTherapist = session?.user?.clinicRole === "THERAPIST";

  const { permissions, isLoading: permsLoading } = useMyPermissions();

  const [chatUnread, setChatUnread] = useState(0);
  useEffect(() => {
    if (!isChatMember) return;
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
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isChatMember]);

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

  // מצב פתיחה של הקבוצות המתקפלות. ברירת מחדל סגור (העדר מפתח = false) — קבוע
  // ולא תלוי-client, כדי שלא תהיה אי-התאמת hydration.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // צ׳אט צוות — פריט עם badge של הודעות שלא נקראו. נכלל בקבוצת "תקשורת" רק
  // לחברי קליניקה; לעצמאי הכותרת תהיה "תקשורת" (בלי "וצוות").
  const teamChatItem: NavItem = {
    title: "צ׳אט צוות",
    href: "/dashboard/team-chat",
    icon: MessagesSquare,
    badge: chatUnread > 0 ? chatUnread : undefined,
  };

  // gating מותנה-הרשאה למזכיר/ה (fail-closed עד שההרשאות נטענו). תואם לאכיפת
  // השרת: תשלומים+קבלות דרך canViewPayments; הודעות דרך canSendReminders;
  // רשימת המתנה דרך canCreateClient; דוחות דרך canViewStats. UI gating בלבד.
  const can = (perm: boolean) => !permsLoading && perm;

  // קבוצת "תקשורת": הודעות (למזכיר/ה לפי canSendReminders) + צ׳אט צוות (חבר/ת קליניקה).
  const messagesItem: NavItem = {
    title: "הודעות ותזכורות",
    href: "/dashboard/communications",
    icon: Mail,
  };
  // מזכיר/ה עם הרשאת הקצאת מטלות — מסך ניהול המטלות בתוך מעטפת הדשבורד שלה
  // (אותו רכיב כמו /clinic-admin/tasks), כדי שלא תיזרק למעטפת ניהול הקליניקה.
  // הבעלים/מנהלת מגיע/ה למטלות דרך "הקליניקה שלי" → /clinic-admin/tasks.
  const staffTasksItem: NavItem = {
    title: "מטלות צוות",
    href: "/dashboard/staff-tasks",
    icon: ClipboardList,
  };
  const communicationItems: NavItem[] = [
    ...(isSecretaryUser ? (can(permissions.canSendReminders) ? [messagesItem] : []) : [messagesItem]),
    ...(isChatMember ? [teamChatItem] : []),
    ...(isSecretaryUser && can(permissions.canAssignTasks) ? [staffTasksItem] : []),
  ];

  // הגדרות מערכת + (למטפל/ת בקליניקה בלבד) קישור ליזום תהליך עזיבה.
  const settingsGroupItems: NavItem[] = [
    ...settingsItems,
    ...(isClinicTherapist
      ? [{ title: "עזיבת קליניקה", href: "/dashboard/clinic/leave", icon: UserMinus }]
      : []),
  ];

  // הקבוצות לפי תפקיד. סדר לפי העבודה היומיומית; קבלה/דוחות/הגדרות/תמיכה מקופלים.
  // קבוצה ריקה (כל פריטיה מסוננים בהרשאה) לא תרונדר.
  const navGroups: NavGroup[] = isSecretaryUser
    ? [
        { key: "anchors", items: anchorItems },
        {
          key: "finance",
          label: "כספים וגבייה",
          items: can(permissions.canViewPayments)
            ? [
                { title: "תשלומים", href: "/dashboard/payments", icon: CreditCard },
                { title: "קבלות", href: "/dashboard/receipts", icon: Receipt },
              ]
            : [],
        },
        {
          key: "communication",
          label: isChatMember ? "תקשורת וצוות" : "תקשורת",
          items: communicationItems,
        },
        {
          key: "intake",
          label: "קליטת מטופלים",
          collapsible: true,
          items: can(permissions.canCreateClient)
            ? [{ title: "רשימת המתנה", href: "/dashboard/waitlist", icon: Clock }]
            : [],
        },
        {
          key: "reports",
          label: "דוחות ובקרה",
          collapsible: true,
          items: can(permissions.canViewStats) ? reportsItems : [],
        },
        { key: "support", label: "תמיכה ושירות", items: supportItems },
      ]
    : [
        { key: "anchors", items: anchorItems },
        { key: "clinical", label: "ניהול קליני", items: clinicalFlowItems },
        { key: "finance", label: "כספים וגבייה", items: financeItems },
        {
          key: "communication",
          label: isChatMember ? "תקשורת וצוות" : "תקשורת",
          items: communicationItems,
        },
        { key: "intake", label: "קליטת מטופלים", collapsible: true, items: intakeItems },
        { key: "reports", label: "דוחות ובקרה", collapsible: true, items: reportsItems },
        { key: "settings", label: "הגדרות מערכת", collapsible: true, items: settingsGroupItems },
        { key: "support", label: "תמיכה ושירות", items: supportItems },
      ];

  const renderMenu = (items: NavItem[]) => (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
            <Link href={item.href}>
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
              {item.badge ? (
                <Badge
                  variant="default"
                  className="ms-auto h-5 min-w-5 justify-center px-1.5 text-xs group-data-[collapsible=icon]:hidden"
                >
                  {item.badge}
                </Badge>
              ) : null}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  return (
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link href="/dashboard" className="flex items-center justify-center py-3 px-2 hover:opacity-80 transition-opacity">
              <AppLogo width={160} height={80} className="object-contain" priority />
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* מתג גלובלי "שלי / כל הקליניקה" — בעל/ת קליניקה בלבד. משפיע על כל המסכים. */}
        {showViewToggle && (
          <div className="pt-2">
            <ViewScopeToggle initialMode={initialViewMode} />
          </div>
        )}

        {/* ניווט מסודר לפי הזרימה היומיומית. קבוצות פתוחות לעבודה השוטפת,
            קבוצות נדירות מתקפלות (collapsible). קבוצה ריקה לא מרונדרת. */}
        {navGroups.map((group) => {
          if (group.items.length === 0) return null;

          if (group.collapsible) {
            const isOpen = !!openGroups[group.key];
            return (
              <Collapsible
                key={group.key}
                open={isOpen}
                onOpenChange={(o) =>
                  setOpenGroups((prev) => ({ ...prev, [group.key]: o }))
                }
              >
                <SidebarGroup>
                  <CollapsibleTrigger asChild>
                    <SidebarGroupLabel asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between cursor-pointer hover:text-sidebar-foreground"
                      >
                        <span>{group.label}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 transition-transform",
                            isOpen && "rotate-180"
                          )}
                        />
                      </button>
                    </SidebarGroupLabel>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarGroupContent>{renderMenu(group.items)}</SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            );
          }

          return (
            <SidebarGroup key={group.key}>
              {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
              <SidebarGroupContent>{renderMenu(group.items)}</SidebarGroupContent>
            </SidebarGroup>
          );
        })}

        {/* Clinic Admin Section — בעלי קליניקה (וגם ADMIN לבדיקות) */}
        {isClinicOwner && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-emerald-600">ניהול קליניקה</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/clinic-admin")}
                    tooltip="לוח הבקרה של הקליניקה"
                  >
                    <Link
                      href="/clinic-admin"
                      className="text-emerald-600 hover:text-emerald-500"
                    >
                      <Building2 className="h-4 w-4" />
                      <span>הקליניקה שלי</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ניהול קליניקה — מזכיר/ה עם הרשאת העברה: קישור גלוי מוגבל (במקום
            deep-links נסתרים). מובילה לפעולות שמותרות לה בלבד; הסקירה המלאה
            (כסף/חוזה) נשארת לבעל/ת הקליניקה. !permsLoading למניעת הבזק. */}
        {isSecretaryUser && !permsLoading && permissions.canTransferClient && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-emerald-600">ניהול קליניקה</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/clinic-admin")}
                    tooltip="העברת מטופלים בין מטפלים"
                  >
                    <Link
                      href="/clinic-admin/transfer"
                      className="text-emerald-600 hover:text-emerald-500"
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                      <span>העברת מטופלים</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

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
              <Link href="/dashboard/settings?tab=profile" className="flex items-center gap-3">
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













