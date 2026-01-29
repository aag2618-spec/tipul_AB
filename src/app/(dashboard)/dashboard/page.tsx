import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Calendar, CreditCard, Clock, Plus } from "lucide-react";
import Link from "next/link";
import { PersonalTasksWidget } from "@/components/tasks/personal-tasks-widget";
import { TodaySessionCard } from "@/components/dashboard/today-session-card";
import { SubBoxLink } from "@/components/dashboard-stat-card";

// Helper to convert UTC time to Israel time for display
function toIsraelTime(utcDate: Date): Date {
  const date = new Date(utcDate);
  // Check if in DST (roughly late March to late October)
  const month = date.getUTCMonth() + 1;
  const isDST = month >= 3 && month <= 10;
  const offsetHours = isDST ? 3 : 2;
  
  // Add Israel offset to UTC time
  date.setUTCHours(date.getUTCHours() + offsetHours);
  return date;
}

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
    waitingClientsCount,
    inactiveClients,
    archivedClients,
    sessionsThisWeek,
    sessionsThisMonth,
    pendingPayments,
    pendingTasks,
    todaySessions,
  ] = await Promise.all([
    prisma.client.count({ where: { therapistId: userId } }),
    prisma.client.count({ where: { therapistId: userId, status: "ACTIVE" } }),
    prisma.client.count({ where: { therapistId: userId, status: "WAITING" } }),
    prisma.client.count({ where: { therapistId: userId, status: "INACTIVE" } }),
    prisma.client.count({ where: { therapistId: userId, status: "ARCHIVED" } }),
    prisma.therapySession.count({
      where: {
        therapistId: userId,
        startTime: { gte: weekStart, lt: weekEnd },
        status: { not: "CANCELLED" },
        type: { not: "BREAK" }
      },
    }),
    prisma.therapySession.count({
      where: {
        therapistId: userId,
        startTime: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELLED" },
        type: { not: "BREAK" }
      },
    }),
    // Count actual pending payments
    prisma.payment.count({
      where: {
        client: { therapistId: userId },
        status: "PENDING",
      },
    }),
    // Count tasks - only show WRITE_SUMMARY tasks for past sessions
    prisma.task.count({
      where: {
        userId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        OR: [
          { type: { not: "WRITE_SUMMARY" } },
          { type: "WRITE_SUMMARY", dueDate: { lte: new Date() } },
        ],
      },
    }),
    prisma.therapySession.findMany({
      where: {
        therapistId: userId,
        startTime: { gte: today, lt: tomorrow },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        type: true,
        price: true,
        status: true,
        _count: {
          select: {
            sessionNote: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
            creditBalance: true,
          },
        },
        payment: {
          select: {
            id: true,
            status: true,
            amount: true,
          },
        },
      },
      orderBy: { startTime: "asc" },
    }),
  ]);

  return {
    totalClients,
    activeClients,
    waitingClientsCount,
    inactiveClients,
    archivedClients,
    sessionsThisWeek,
    sessionsThisMonth,
    pendingPayments,
    pendingTasks,
    todaySessions,
  };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return <div>טוען...</div>;
  }

  const stats = await getDashboardStats(session.user.id);

  // Get stat cards
  const statCards = [
    {
      title: "מטופלים פעילים",
      value: stats.activeClients,
      description: `מתוך ${stats.totalClients} סה"כ`,
      icon: Users,
      href: "/dashboard/clients",
      bgColor: "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30",
      iconColor: "text-blue-600",
      subBox: stats.waitingClientsCount > 0 ? {
        value: stats.waitingClientsCount,
        label: "ממתינים",
        bgColor: "bg-yellow-100/50 dark:bg-yellow-900/50",
        textColor: "text-yellow-700 dark:text-yellow-300",
        href: "/dashboard/clients?status=WAITING",
      } : null,
    },
    {
      title: "פגישות השבוע",
      value: stats.sessionsThisWeek,
      description: `${stats.sessionsThisMonth} החודש`,
      icon: Calendar,
      href: "/dashboard/calendar",
      bgColor: "bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30",
      iconColor: "text-green-600",
    },
    {
      title: "תשלומים ממתינים",
      value: stats.pendingPayments,
      description: "דורשים טיפול",
      icon: CreditCard,
      href: "/dashboard/payments",
      bgColor: "bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/30 dark:to-orange-900/30",
      iconColor: "text-orange-600",
    },
    {
      title: "משימות ממתינות",
      value: stats.pendingTasks,
      description: "לביצוע",
      icon: Clock,
      href: "/dashboard/tasks",
      bgColor: "bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30",
      iconColor: "text-purple-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">דשבורד</h1>
          <p className="text-muted-foreground mt-1">
            סקירה כללית של הפעילות שלך
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/sessions/new">
            <Plus className="h-4 w-4 ml-2" />
            פגישה חדשה
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className={`group relative overflow-hidden ${stat.bgColor} border-2 border-transparent hover:border-current cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:brightness-100! hover:bg-transparent!`}>
            <Link href={stat.href} className="absolute inset-0 z-10 hover:brightness-100! hover:bg-transparent! hover:shadow-none! hover:scale-100!">
              <span className="sr-only">{stat.title}</span>
            </Link>
            <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-0">
              <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white group-hover:font-bold transition-all duration-300">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.iconColor} group-hover:scale-110 transition-transform duration-300`} />
            </CardHeader>
            <CardContent className="relative z-0">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 group-hover:text-black dark:group-hover:text-white group-hover:scale-110 transition-all duration-300">{stat.value}</div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200 group-hover:font-semibold transition-all duration-300">{stat.description}</p>
                </div>
                {stat.subBox && !stat.subBox.href && (
                  <div className={`${stat.subBox.bgColor || 'bg-primary/10'} rounded-lg px-3 py-2 text-center`}>
                    <div className={`text-lg font-bold ${stat.subBox.textColor || 'text-primary'}`}>{stat.subBox.value}</div>
                    <p className={`text-xs ${stat.subBox.textColor ? stat.subBox.textColor + '/70' : 'text-primary/70'}`}>{stat.subBox.label}</p>
                  </div>
                )}
              </div>
            </CardContent>
            {stat.subBox && stat.subBox.href && (
              <div className="absolute bottom-6 left-6 z-20">
                <SubBoxLink
                  href={stat.subBox.href}
                  value={stat.subBox.value}
                  label={stat.subBox.label}
                  bgColor={stat.subBox.bgColor}
                  textColor={stat.subBox.textColor}
                />
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Today's Sessions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>פגישות היום</CardTitle>
              <CardDescription>לוח הזמנים שלך להיום</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/calendar">לוח שנה</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats.todaySessions.length > 0 ? (
              <div className="space-y-4">
                {stats.todaySessions.map((therapySession) => (
                  <TodaySessionCard 
                    key={therapySession.id} 
                    session={{
                      id: therapySession.id,
                      startTime: therapySession.startTime,
                      endTime: therapySession.endTime,
                      type: therapySession.type as string,
                      status: therapySession.status as string,
                      price: Number(therapySession.price),
                      sessionNote: therapySession._count.sessionNote > 0 ? "exists" : null,
                      payment: therapySession.payment ? {
                        id: therapySession.payment.id,
                        status: therapySession.payment.status as string,
                        amount: Number(therapySession.payment.amount),
                      } : null,
                      client: therapySession.client ? {
                        id: therapySession.client.id,
                        name: therapySession.client.name,
                        creditBalance: Number(therapySession.client.creditBalance),
                      } : null,
                    }} 
                  />
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
