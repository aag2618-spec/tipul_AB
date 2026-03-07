"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bell, LogOut, Settings, User, XCircle, Mail, Calendar, X, ListTodo, Info, AlertTriangle, CheckCircle, Sparkles } from "lucide-react";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  read: boolean;
  createdAt: string;
}

interface SystemAnnouncement {
  id: string;
  title: string;
  content: string;
  type: "info" | "warning" | "success" | "update";
  createdAt: string;
}

const ANNOUNCEMENT_STYLES: Record<string, { bg: string; border: string; text: string; icon: typeof Info }> = {
  info: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-600 dark:text-blue-400", icon: Info },
  warning: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-600 dark:text-amber-400", icon: AlertTriangle },
  success: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle },
  update: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-600 dark:text-purple-400", icon: Sparkles },
};

interface DashboardHeaderProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);

  const fetchNotifications = async () => {
    try {
      const response = await fetch("/api/notifications?limit=20&unread=true");
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const fetchAnnouncements = useCallback(async () => {
    try {
      const response = await fetch("/api/announcements/active");
      if (response.ok) {
        const data = await response.json();
        setAnnouncements(data.announcements || []);
      }
    } catch (error) {
      console.error("Error fetching announcements:", error);
    }
  }, []);

  const dismissAnnouncement = async (announcementId: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== announcementId));
    try {
      await fetch("/api/announcements/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcementId }),
      });
    } catch (error) {
      console.error("Error dismissing announcement:", error);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchAnnouncements();
    
    const notifInterval = setInterval(fetchNotifications, 30000);
    const announcementInterval = setInterval(fetchAnnouncements, 5 * 60 * 1000);
    
    return () => {
      clearInterval(notifInterval);
      clearInterval(announcementInterval);
    };
  }, [fetchAnnouncements]);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "POST" });
      // Remove from local state immediately for instant UI feedback
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const dismissNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Don't trigger the parent click (navigation)
    try {
      await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      // Remove from local state immediately
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Error dismissing notification:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST" });
      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "מ";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "CANCELLATION_REQUEST":
        return <XCircle className="h-4 w-4 text-orange-500" />;
      case "BOOKING_REQUEST":
        return <Calendar className="h-4 w-4 text-amber-500" />;
      case "EMAIL_RECEIVED":
        return <Mail className="h-4 w-4 text-sky-500" />;
      case "EMAIL_SENT":
        return <Mail className="h-4 w-4 text-sky-500" />;
      case "SESSION_REMINDER":
        return <Calendar className="h-4 w-4 text-green-500" />;
      case "PENDING_TASKS":
      case "CUSTOM":
        return <ListTodo className="h-4 w-4 text-amber-500" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    if (notification.type === "BOOKING_REQUEST") {
      router.push("/dashboard/calendar");
    } else if (notification.type === "CANCELLATION_REQUEST") {
      router.push("/dashboard/calendar");
    } else if (notification.type === "PENDING_TASKS" || notification.type === "CUSTOM") {
      router.push("/dashboard#personal-tasks");
      setTimeout(() => {
        document.getElementById("personal-tasks")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    } else {
      router.push("/dashboard/communications");
    }
  };

  const totalBadge = unreadCount;

  return (
    <>
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
      <SidebarTrigger className="-mr-2" />
      
      <div className="flex-1" />
      
      <div className="flex items-center gap-2">
        {/* Notifications Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {totalBadge > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {totalBadge > 9 ? "9+" : totalBadge}
                </Badge>
              )}
              <span className="sr-only">התראות</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>תשובות ממטופלים</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {unreadCount} חדשות
                </Badge>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {/* Recent Notifications - only unread */}
            {notifications.length > 0 ? (
              <div className="max-h-[400px] overflow-y-auto">
                {notifications.map((notification) => (
                  <DropdownMenuItem 
                    key={notification.id}
                    className="cursor-pointer flex items-start gap-3 p-3"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    {getNotificationIcon(notification.type)}
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium">
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {notification.content}
                      </p>
                    </div>
                    <button
                      onClick={(e) => dismissNotification(e, notification.id)}
                      className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground flex-shrink-0"
                      title="מחק התראה"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground text-sm">
                אין תשובות חדשות ממטופלים
              </div>
            )}
            
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1">
              <Link 
                href="/dashboard/communications" 
                className="text-sm text-primary hover:underline px-2 py-1"
              >
                צפה בכל התקשורת
              </Link>
              {notifications.length > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                >
                  סמן הכל כנקרא
                </button>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        
        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings/profile" className="cursor-pointer">
                <User className="ml-2 h-4 w-4" />
                <span>פרופיל</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" className="cursor-pointer">
                <Settings className="ml-2 h-4 w-4" />
                <span>הגדרות</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="ml-2 h-4 w-4" />
              <span>התנתקות</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>

    {/* System Announcements Banner */}
    {announcements.length > 0 && (
      <div className="space-y-0">
        {announcements.map((announcement) => {
          const style = ANNOUNCEMENT_STYLES[announcement.type] || ANNOUNCEMENT_STYLES.info;
          const AnnouncementIcon = style.icon;
          return (
            <div
              key={announcement.id}
              className={`flex items-center gap-3 px-6 py-2.5 ${style.bg} border-b ${style.border}`}
            >
              <AnnouncementIcon className={`h-4 w-4 flex-shrink-0 ${style.text}`} />
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium ${style.text}`}>
                  {announcement.title}
                </span>
                <span className="text-sm text-muted-foreground mr-2">
                  {announcement.content}
                </span>
              </div>
              <button
                onClick={() => dismissAnnouncement(announcement.id)}
                className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          );
        })}
      </div>
    )}
    </>
  );
}













