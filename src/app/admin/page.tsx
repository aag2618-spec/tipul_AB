"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { 
  Loader2, 
  Users, 
  Activity, 
  CreditCard, 
  HardDrive, 
  TrendingUp, 
  TrendingDown,
  Bell,
  AlertCircle,
  Clock,
  ArrowRight,
} from "lucide-react";

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  totalApiCalls: number;
  apiCallsToday: number;
  totalRevenue: number;
  pendingPayments: number;
  totalStorageGB: number;
  averageStoragePerUser: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/admin/stats");
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const statCards = [
    {
      title: "משתמשים",
      value: stats?.totalUsers || 0,
      description: `${stats?.activeUsers || 0} פעילים | ${stats?.newUsersThisMonth || 0} חדשים החודש`,
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/20",
    },
    {
      title: "קריאות API",
      value: stats?.totalApiCalls || 0,
      description: `${stats?.apiCallsToday || 0} היום`,
      icon: Activity,
      color: "text-green-500",
      bgColor: "bg-green-500/20",
    },
    {
      title: "הכנסות",
      value: `₪${(stats?.totalRevenue || 0).toLocaleString()}`,
      description: `${stats?.pendingPayments || 0} תשלומים ממתינים`,
      icon: CreditCard,
      color: "text-amber-500",
      bgColor: "bg-amber-500/20",
    },
    {
      title: "אחסון",
      value: `${(stats?.totalStorageGB || 0).toFixed(2)} GB`,
      description: `ממוצע ${(stats?.averageStoragePerUser || 0).toFixed(2)} GB למשתמש`,
      icon: HardDrive,
      color: "text-purple-500",
      bgColor: "bg-purple-500/20",
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">דשבורד ניהול</h1>
        <p className="text-slate-400 mt-2">סקירה כללית של המערכת</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title} className="bg-slate-900 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                {card.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{card.value}</div>
              <p className="text-xs text-slate-500 mt-1">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerts Section */}
      <PendingAlerts />

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">משתמשים אחרונים</CardTitle>
            <CardDescription>משתמשים שנרשמו לאחרונה</CardDescription>
          </CardHeader>
          <CardContent>
            <RecentUsers />
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">פעילות API אחרונה</CardTitle>
            <CardDescription>קריאות API אחרונות במערכת</CardDescription>
          </CardHeader>
          <CardContent>
            <RecentApiCalls />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PendingAlerts() {
  const [alerts, setAlerts] = useState<Array<{
    id: string;
    type: string;
    priority: string;
    title: string;
    createdAt: string;
  }>>([]);
  const [counts, setCounts] = useState({ PENDING: 0, urgent: 0, high: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch("/api/admin/alerts?status=PENDING&limit=5");
        if (response.ok) {
          const data = await response.json();
          setAlerts(data.alerts || []);
          setCounts({
            PENDING: data.counts?.PENDING || 0,
            urgent: data.pendingByPriority?.URGENT || 0,
            high: data.pendingByPriority?.HIGH || 0,
          });
        }
      } catch (error) {
        console.error("Failed to fetch alerts:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAlerts();
  }, []);

  if (isLoading) {
    return null;
  }

  if (counts.PENDING === 0) {
    return null;
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "URGENT": return "text-red-500 bg-red-500/20";
      case "HIGH": return "text-orange-500 bg-orange-500/20";
      case "MEDIUM": return "text-yellow-500 bg-yellow-500/20";
      default: return "text-slate-400 bg-slate-500/20";
    }
  };

  return (
    <Card className={`bg-slate-900 border-slate-800 ${counts.urgent > 0 ? 'border-red-500/50' : counts.high > 0 ? 'border-orange-500/50' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className={`h-5 w-5 ${counts.urgent > 0 ? 'text-red-500 animate-pulse' : 'text-amber-500'}`} />
            <CardTitle className="text-white">התראות ממתינות</CardTitle>
            <Badge variant="destructive">{counts.PENDING}</Badge>
            {counts.urgent > 0 && (
              <Badge className="bg-red-600">{counts.urgent} דחופות</Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" asChild className="text-slate-400 hover:text-white">
            <Link href="/admin/alerts">
              צפה בכל ההתראות
              <ArrowRight className="mr-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div 
              key={alert.id} 
              className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded ${getPriorityColor(alert.priority)}`}>
                  {alert.priority === "URGENT" || alert.priority === "HIGH" ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <Clock className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-white text-sm">{alert.title}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(alert.createdAt).toLocaleDateString("he-IL")}
                  </p>
                </div>
              </div>
              <Badge 
                variant="outline" 
                className={`text-xs ${
                  alert.priority === "URGENT" ? "border-red-500 text-red-500" :
                  alert.priority === "HIGH" ? "border-orange-500 text-orange-500" :
                  "border-slate-500 text-slate-400"
                }`}
              >
                {alert.priority === "URGENT" ? "דחוף" : 
                 alert.priority === "HIGH" ? "גבוה" : 
                 alert.priority === "MEDIUM" ? "בינוני" : "נמוך"}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentUsers() {
  const [users, setUsers] = useState<Array<{id: string; name: string; email: string; createdAt: string}>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch("/api/admin/users?limit=5&sort=createdAt&order=desc");
        if (response.ok) {
          const data = await response.json();
          setUsers(data.users || []);
        }
      } catch (error) {
        console.error("Failed to fetch users:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
  }, []);

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  if (users.length === 0) {
    return <p className="text-slate-500 text-center py-4">אין משתמשים</p>;
  }

  return (
    <div className="space-y-3">
      {users.map((user) => (
        <div key={user.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
          <div>
            <p className="font-medium text-white">{user.name || "ללא שם"}</p>
            {user.email ? (
              <a 
                href={`mailto:${user.email}`}
                className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
              >
                {user.email}
              </a>
            ) : (
              <p className="text-sm text-slate-500">ללא מייל</p>
            )}
          </div>
          <span className="text-xs text-slate-500">
            {new Date(user.createdAt).toLocaleDateString("he-IL")}
          </span>
        </div>
      ))}
    </div>
  );
}

function RecentApiCalls() {
  const [calls, setCalls] = useState<Array<{id: string; endpoint: string; user: {name: string}; createdAt: string; success: boolean}>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCalls = async () => {
      try {
        const response = await fetch("/api/admin/api-usage?limit=5");
        if (response.ok) {
          const data = await response.json();
          setCalls(data.logs || []);
        }
      } catch (error) {
        console.error("Failed to fetch API calls:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCalls();
  }, []);

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  if (calls.length === 0) {
    return <p className="text-slate-500 text-center py-4">אין קריאות API</p>;
  }

  return (
    <div className="space-y-3">
      {calls.map((call) => (
        <div key={call.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
          <div className="flex items-center gap-2">
            {call.success ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
            <div>
              <p className="font-medium text-white text-sm">{call.endpoint}</p>
              <p className="text-xs text-slate-500">{call.user?.name || "משתמש"}</p>
            </div>
          </div>
          <span className="text-xs text-slate-500">
            {new Date(call.createdAt).toLocaleTimeString("he-IL")}
          </span>
        </div>
      ))}
    </div>
  );
}
