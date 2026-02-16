"use client";

import { useState, useEffect } from "react";
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
import { Bell, LogOut, Settings, User, XCircle, Mail, Calendar, X } from "lucide-react";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  read: boolean;
  createdAt: string;
}

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
  const [pendingCancellations, setPendingCancellations] = useState(0);

  useEffect(() => {
    fetchNotifications();
    fetchPendingCancellations();
    
    // רענון כל 30 שניות
    const interval = setInterval(() => {
      fetchNotifications();
      fetchPendingCancellations();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await fetch("/api/notifications?limit=20&unread=true&type=EMAIL_RECEIVED");
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const fetchPendingCancellations = async () => {
    try {
      const response = await fetch("/api/cancellation-requests?status=PENDING&limit=1");
      if (response.ok) {
        const data = await response.json();
        setPendingCancellations(data.total || 0);
      }
    } catch (error) {
      console.error("Error fetching cancellations:", error);
    }
  };

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
      case "EMAIL_RECEIVED":
        return <Mail className="h-4 w-4 text-blue-500" />;
      case "EMAIL_SENT":
        return <Mail className="h-4 w-4 text-blue-500" />;
      case "SESSION_REMINDER":
        return <Calendar className="h-4 w-4 text-green-500" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    // Navigate to communications page to see the email reply
    router.push("/dashboard/communications");
  };

  const totalBadge = unreadCount + pendingCancellations;

  return (
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
            
            {/* Pending Cancellations Alert */}
            {pendingCancellations > 0 && (
              <>
                <DropdownMenuItem asChild>
                  <Link 
                    href="/dashboard/cancellation-requests" 
                    className="cursor-pointer flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-950"
                  >
                    <XCircle className="h-5 w-5 text-orange-500" />
                    <div className="flex-1">
                      <p className="font-medium text-orange-700 dark:text-orange-300">
                        {pendingCancellations} בקשות ביטול ממתינות
                      </p>
                      <p className="text-xs text-orange-600 dark:text-orange-400">
                        לחץ לצפייה ואישור
                      </p>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            
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
            ) : pendingCancellations === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                אין תשובות חדשות ממטופלים
              </div>
            ) : null}
            
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
  );
}













