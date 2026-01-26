import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Calendar, CreditCard, Clock, Plus, ClipboardList, CheckCircle, User, FileText } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { PersonalTasksWidget } from "@/components/tasks/personal-tasks-widget";
import { CompleteSessionDialog } from "@/components/sessions/complete-session-dialog";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
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
      include: { 
        client: {
          select: {
            id: true,
            name: true,
            creditBalance: true,
          }
        },
        sessionNote: true,
        payment: true,
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
  if (!session?.user?.id) return null;

  const stats = await getDashboardStats(session.user.id);

  const statCards = [
    {
      title: "מטופלים פעילים",
      value: stats.activeClients,
      description: `מתוך ${stats.totalClients} סה״כ`,
      icon: Users,
      href: "/dashboard/clients?status=ACTIVE",
      bgColor: "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900",
      iconColor: "text-blue-600 dark:text-blue-400",
      subBox: stats.waitingClientsCount > 0 ? {
        value: stats.waitingClientsCount,
        label: "ממתינים",
        href: "/dashboard/clients?status=WAITING",
        bgColor: "bg-amber-100",
        textColor: "text-amber-700",
      } : null,
    },
    {
      title: "פגישות השבוע",
      value: stats.sessionsThisWeek,
      description: "פגישות בשבוע הנוכחי",
      icon: Calendar,
      href: "/dashboard/calendar",
      bgColor: "bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900",
      iconColor: "text-purple-600 dark:text-purple-400",
      subBox: {
        value: stats.sessionsThisMonth,
        label: "החודש",
        href: "/dashboard/calendar?view=month",
      },
    },
    {
      title: "תשלומים ממתינים",
      value: stats.pendingPayments,
      description: "לגבייה",
      icon: CreditCard,
      href: "/dashboard/payments",
      bgColor: "bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900",
      iconColor: "text-green-600 dark:text-green-400",
      subBox: null,
    },
    {
      title: "משימות פתוחות",
      value: stats.pendingTasks,
      description: "ממתינות לטיפול",
      icon: Clock,
      href: "/dashboard/tasks",
      bgColor: "bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900",
      iconColor: "text-orange-600 dark:text-orange-400",
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
          <Card key={stat.title} className={`group relative overflow-hidden ${stat.bgColor} border-muted cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-black/10 dark:hover:shadow-white/5 hover:scale-[1.02] hover:border-primary/30`}>
            <Link href={stat.href} className="absolute inset-0 z-10">
              <span className="sr-only">{stat.title}</span>
            </Link>
            <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-0">
              <CardTitle className="text-sm font-medium text-foreground/70">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
            </CardHeader>
            <CardContent className="relative z-0">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">{stat.description}</p>
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
                  <div key={therapySession.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-background">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex flex-col items-center justify-center w-14 h-14 rounded-lg bg-primary/10 text-primary">
                        <span className="text-base font-bold">
                          {format(toIsraelTime(new Date(therapySession.startTime)), "HH:mm")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {Math.round((new Date(therapySession.endTime).getTime() - new Date(therapySession.startTime).getTime()) / 60000)} דק'
                        </span>
                      </div>
                      <div className="flex-1">
                        {therapySession.client ? (
                          <span className="font-medium">{therapySession.client.name}</span>
                        ) : (
                          <span className="font-medium">🌊 הפסקה</span>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-muted-foreground">
                            {therapySession.type === "BREAK" ? "הפסקה" : therapySession.type === "ONLINE" ? "אונליין" : therapySession.type === "PHONE" ? "טלפון" : "פרונטלי"}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* כפתורי ניווט - רק תיקית מטופל */}
                      {therapySession.client && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dashboard/clients/${therapySession.client.id}`}>
                            <User className="h-4 w-4 ml-1" />
                            תיקית מטופל
                          </Link>
                        </Button>
                      )}
                      
                      {/* כפתור סיכום */}
                      {therapySession.client && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dashboard/sessions/${therapySession.id}`}>
                            <FileText className="h-4 w-4 ml-1" />
                            סיכום
                          </Link>
                        </Button>
                      )}
                      
                      {/* כפתור סיום ותשלום / הוסף תשלום */}
                      {therapySession.client && (!therapySession.payment || therapySession.payment.status !== "PAID") && (
                        <CompleteSessionDialog
                          sessionId={therapySession.id}
                          clientId={therapySession.client.id}
                          clientName={therapySession.client.name}
                          sessionDate={format(new Date(therapySession.startTime), "d/M/yyyy HH:mm")}
                          defaultAmount={Number(therapySession.price)}
                          creditBalance={Number(therapySession.client.creditBalance || 0)}
                          hasNote={!!therapySession.sessionNote}
                          hasPayment={therapySession.payment?.status === "PAID"}
                          buttonText={therapySession.status === "COMPLETED" ? "הוסף תשלום" : "סיום ותשלום"}
                        />
                      )}
                      
                      {therapySession.sessionNote && (
                        <Badge className="bg-green-100 text-green-700 border-green-200">
                          סוכם
                        </Badge>
                      )}
                      
                      {therapySession.payment?.status === "PAID" && (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                          <CheckCircle className="h-3 w-3 ml-1" />
                          שולם
                        </Badge>
                      )}
                      
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













