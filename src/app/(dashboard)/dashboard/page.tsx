import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Calendar, CreditCard, Clock, Plus, UserPlus, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { PersonalTasksWidget } from "@/components/tasks/personal-tasks-widget";

async function getDashboardStats(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

  const [
    totalClients,
    activeClients,
    sessionsThisWeek,
    sessionsThisMonth,
    pendingPayments,
    pendingTasks,
    todaySessions,
    waitingClients,
  ] = await Promise.all([
    prisma.client.count({ where: { therapistId: userId } }),
    prisma.client.count({ where: { therapistId: userId, status: "ACTIVE" } }),
    prisma.therapySession.count({
      where: {
        therapistId: userId,
        startTime: { gte: weekStart, lt: weekEnd },
        status: { not: "CANCELLED" }
      },
    }),
    prisma.therapySession.count({
      where: {
        therapistId: userId,
        startTime: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELLED" }
      },
    }),
    // Count completed sessions without paid payment
    prisma.therapySession.count({
      where: {
        therapistId: userId,
        status: "COMPLETED",
        endTime: { lt: new Date() }, // Only past sessions
        OR: [
          { payment: null }, // No payment record
          { payment: { status: { not: "PAID" } } }, // Payment exists but not paid
        ],
      },
    }),
    prisma.task.count({
      where: { userId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    }),
    prisma.therapySession.findMany({
      where: {
        therapistId: userId,
        startTime: { gte: today, lt: tomorrow },
      },
      include: { client: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.client.findMany({
      where: { therapistId: userId, status: "WAITING" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    totalClients,
    activeClients,
    sessionsThisWeek,
    sessionsThisMonth,
    pendingPayments,
    pendingTasks,
    todaySessions,
    waitingClients,
  };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const stats = await getDashboardStats(session.user.id);

  const statCards = [
    {
      title: "מטופלים פעילים",
      value: stats.activeClients,
      description: `מתוך ${stats.totalClients} סה״כ`,
      icon: Users,
      href: "/dashboard/clients",
      subBox: null,
    },
    {
      title: "פגישות השבוע",
      value: stats.sessionsThisWeek,
      description: "פגישות בשבוע הנוכחי",
      icon: Calendar,
      href: "/dashboard/calendar",
      subBox: {
        value: stats.sessionsThisMonth,
        label: "החודש",
      },
    },
    {
      title: "תשלומים ממתינים",
      value: stats.pendingPayments,
      description: "לגבייה",
      icon: CreditCard,
      href: "/dashboard/payments",
      subBox: null,
    },
    {
      title: "משימות פתוחות",
      value: stats.pendingTasks,
      description: "ממתינות לטיפול",
      icon: Clock,
      href: "/dashboard/tasks",
      subBox: null,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            שלום, {session.user.name?.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground">
            {format(new Date(), "EEEE, d בMMMM yyyy", { locale: he })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/dashboard/clients/new">
              <Plus className="ml-2 h-4 w-4" />
              מטופל חדש
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-3xl font-bold">{stat.value}</div>
                    <p className="text-xs text-muted-foreground">{stat.description}</p>
                  </div>
                  {stat.subBox && (
                    <div className="bg-primary/10 rounded-lg px-3 py-2 text-center">
                      <div className="text-lg font-bold text-primary">{stat.subBox.value}</div>
                      <p className="text-xs text-primary/70">{stat.subBox.label}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Waiting List Widget */}
      {stats.waitingClients.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                <UserPlus className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-lg">רשימת המתנה</CardTitle>
                <CardDescription>
                  {stats.waitingClients.length} מטופלים ממתינים לפגישה ראשונה
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.waitingClients.map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-white border border-amber-100"
                >
                  <div>
                    <Link
                      href={`/dashboard/clients/${client.id}`}
                      className="font-medium hover:text-primary hover:underline transition-colors"
                    >
                      {client.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      ממתין מאז {format(new Date(client.createdAt), "d/M/yyyy")}
                    </p>
                  </div>
                  <Button size="sm" asChild>
                    <Link href={`/dashboard/calendar?client=${client.id}`}>
                      <CalendarPlus className="ml-2 h-4 w-4" />
                      קבע פגישה
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6">
        {/* Today's Sessions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>פגישות היום</CardTitle>
              <CardDescription>
                {stats.todaySessions.length > 0
                  ? `${stats.todaySessions.length} פגישות מתוכננות`
                  : "אין פגישות מתוכננות להיום"}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/calendar">לוח שנה</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats.todaySessions.length > 0 ? (
              <div className="space-y-3">
                {stats.todaySessions.map((therapySession) => (
                  <div
                    key={therapySession.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary">
                        <span className="text-sm font-bold">
                          {format(new Date(therapySession.startTime), "HH:mm")}
                        </span>
                      </div>
                      <div>
                        <Link 
                          href={`/dashboard/clients/${therapySession.client.id}`}
                          className="font-medium hover:text-primary hover:underline transition-colors"
                        >
                          {therapySession.client.name}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {therapySession.type === "ONLINE" ? "אונליין" : "פרונטלי"}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        therapySession.status === "COMPLETED"
                          ? "default"
                          : therapySession.status === "CANCELLED"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {therapySession.status === "SCHEDULED"
                        ? "מתוכנן"
                        : therapySession.status === "COMPLETED"
                        ? "הושלם"
                        : therapySession.status === "CANCELLED"
                        ? "בוטל"
                        : "לא הגיע"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="mx-auto h-12 w-12 mb-3 opacity-50" />
                <p>אין פגישות מתוכננות להיום</p>
                <Button variant="link" asChild className="mt-2">
                  <Link href="/dashboard/calendar">קבע פגישה חדשה</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Personal Tasks Widget */}
      <PersonalTasksWidget />
    </div>
  );
}













