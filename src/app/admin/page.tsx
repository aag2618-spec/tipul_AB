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
  DollarSign,
  BarChart3,
  UserMinus,
  Filter,
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
  mrr: number;
  arr: number;
  churnRate: number;
  churnedUsers: number;
  totalNonTrialing: number;
  funnel: {
    totalSignups: number;
    activeTrials: number;
    convertedToPaid: number;
    currentlyActive: number;
  };
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
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statCards = [
    {
      title: "משתמשים",
      value: stats?.totalUsers || 0,
      description: `${stats?.activeUsers || 0} פעילים | ${stats?.newUsersThisMonth || 0} חדשים החודש`,
      icon: Users,
      color: "text-sky-500",
      bgColor: "bg-sky-500/20",
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
      color: "text-primary",
      bgColor: "bg-primary/15",
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

  const revenueCards = [
    {
      title: "הכנסה חודשית חוזרת",
      value: `₪${(stats?.mrr || 0).toLocaleString()}`,
      description: "סה״כ מנויים משלמים פעילים",
      icon: DollarSign,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/20",
    },
    {
      title: "הכנסה שנתית חוזרת",
      value: `₪${(stats?.arr || 0).toLocaleString()}`,
      description: "הכנסה חודשית × 12",
      icon: BarChart3,
      color: "text-teal-500",
      bgColor: "bg-teal-500/20",
    },
    {
      title: "שיעור נטישה",
      value: `${stats?.churnRate || 0}%`,
      description: `${stats?.churnedUsers || 0} נטשו מתוך ${stats?.totalNonTrialing || 0}`,
      icon: UserMinus,
      color: stats?.churnRate && stats.churnRate > 10 ? "text-red-500" : "text-orange-500",
      bgColor: stats?.churnRate && stats.churnRate > 10 ? "bg-red-500/20" : "bg-orange-500/20",
    },
  ];

  const funnel = stats?.funnel;
  const funnelSteps = funnel ? [
    { label: "נרשמו (כל הזמנים)", value: funnel.totalSignups, pct: 100 },
    { label: "בתקופת ניסיון", value: funnel.activeTrials, pct: funnel.totalSignups > 0 ? Math.round((funnel.activeTrials / funnel.totalSignups) * 100) : 0 },
    { label: "המירו למנוי בתשלום", value: funnel.convertedToPaid, pct: funnel.totalSignups > 0 ? Math.round((funnel.convertedToPaid / funnel.totalSignups) * 100) : 0 },
    { label: "פעילים כעת", value: funnel.currentlyActive, pct: funnel.totalSignups > 0 ? Math.round((funnel.currentlyActive / funnel.totalSignups) * 100) : 0 },
  ] : [];

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">דשבורד ניהול</h1>
        <p className="text-muted-foreground mt-2">סקירה כללית של המערכת</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue & Churn Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {revenueCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Conversion Funnel */}
      {funnel && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-500/20">
                <Filter className="h-4 w-4 text-indigo-500" />
              </div>
              <div>
                <CardTitle>משפך המרה</CardTitle>
                <CardDescription>מהרשמה ועד מנוי פעיל</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {funnelSteps.map((step, i) => {
                const barColors = [
                  "bg-sky-500",
                  "bg-violet-500",
                  "bg-emerald-500",
                  "bg-teal-500",
                ];
                return (
                  <div key={step.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-foreground">{step.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{step.value.toLocaleString()}</span>
                        {i > 0 && (
                          <Badge variant="outline" className="text-xs font-mono">
                            {step.pct}%
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="h-3 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColors[i]}`}
                        style={{ width: `${Math.max(step.pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alerts Section */}
      <PendingAlerts />

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>משתמשים אחרונים</CardTitle>
            <CardDescription>משתמשים שנרשמו לאחרונה</CardDescription>
          </CardHeader>
          <CardContent>
            <RecentUsers />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>פעילות API אחרונה</CardTitle>
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
      default: return "text-muted-foreground bg-muted";
    }
  };

  return (
    <Card className={`${counts.urgent > 0 ? 'border-red-500/50' : counts.high > 0 ? 'border-orange-500/50' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className={`h-5 w-5 ${counts.urgent > 0 ? 'text-red-500 animate-pulse' : 'text-primary'}`} />
            <CardTitle>התראות ממתינות</CardTitle>
            <Badge variant="destructive">{counts.PENDING}</Badge>
            {counts.urgent > 0 && (
              <Badge className="bg-red-600">{counts.urgent} דחופות</Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
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
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
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
                  <p className="font-medium text-sm">{alert.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(alert.createdAt).toLocaleDateString("he-IL")}
                  </p>
                </div>
              </div>
              <Badge 
                variant="outline" 
                className={`text-xs ${
                  alert.priority === "URGENT" ? "border-red-500 text-red-500" :
                  alert.priority === "HIGH" ? "border-orange-500 text-orange-500" :
                  "border-border text-muted-foreground"
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
  const [users, setUsers] = useState<Array<{id: string; name: string; email: string; userNumber: number | null; createdAt: string}>>([]);
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
    return <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (users.length === 0) {
    return <p className="text-muted-foreground text-center py-4">אין משתמשים</p>;
  }

  return (
    <div className="space-y-3">
      {users.map((user) => (
        <div key={user.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{user.name || "ללא שם"}</p>
              {user.userNumber && (
                <Badge variant="outline" className="font-mono text-xs bg-sky-500/10 text-sky-400 border-sky-500/30">
                  #{user.userNumber}
                </Badge>
              )}
            </div>
            {user.email ? (
              <a 
                href={`mailto:${user.email}`}
                className="text-sm text-sky-400 hover:text-sky-300 hover:underline"
              >
                {user.email}
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">ללא מייל</p>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
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
    return <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (calls.length === 0) {
    return <p className="text-muted-foreground text-center py-4">אין קריאות API</p>;
  }

  return (
    <div className="space-y-3">
      {calls.map((call) => (
        <div key={call.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
          <div className="flex items-center gap-2">
            {call.success ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
            <div>
              <p className="font-medium text-sm">{call.endpoint}</p>
              <p className="text-xs text-muted-foreground">{call.user?.name || "משתמש"}</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(call.createdAt).toLocaleTimeString("he-IL")}
          </span>
        </div>
      ))}
    </div>
  );
}
