"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, Activity, CreditCard, HardDrive, TrendingUp, TrendingDown } from "lucide-react";

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
            <p className="text-sm text-slate-500">{user.email}</p>
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
