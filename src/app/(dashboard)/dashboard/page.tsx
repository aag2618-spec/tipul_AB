import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Calendar, CreditCard, Clock, Plus, ClipboardList, CheckCircle, User, FileText, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
      bgColor: "bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800",
      iconColor: "text-blue-700 dark:text-blue-300",
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
      bgColor: "bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900 dark:to-purple-800",
      iconColor: "text-purple-700 dark:text-purple-300",
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
      bgColor: "bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900 dark:to-green-800",
      iconColor: "text-green-700 dark:text-green-300",
      subBox: null,
    },
    {
      title: "משימות פתוחות",
      value: stats.pendingTasks,
      description: "ממתינות לטיפול",
      icon: Clock,
      href: "/dashboard/tasks",
      bgColor: "bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900 dark:to-orange-800",
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
              <div className="space-y-4">
                {stats.todaySessions.map((therapySession) => (
                  <div key={therapySession.id} className="p-4 rounded-lg border border-border bg-background space-y-3">
                    {/* שורה 1: זמן + סוג פגישה */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center justify-center w-14 h-14 rounded-lg bg-primary/10 text-primary">
                          <span className="text-base font-bold">
                            {format(toIsraelTime(new Date(therapySession.startTime)), "HH:mm")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {Math.round((new Date(therapySession.endTime).getTime() - new Date(therapySession.startTime).getTime()) / 60000)} דק'
                          </span>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {format(toIsraelTime(new Date(therapySession.startTime)), "EEEE, d בMMMM", { locale: he })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {therapySession.type === "BREAK" ? "הפסקה" : therapySession.type === "ONLINE" ? "אונליין" : therapySession.type === "PHONE" ? "טלפון" : "פרונטלי"}
                          </p>
                        </div>
                      </div>
                      
                      <Badge
                        variant={
                          therapySession.status === "COMPLETED"
                            ? "default"
                            : therapySession.status === "CANCELLED"
                            ? "destructive"
                            : therapySession.status === "NO_SHOW"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {therapySession.status === "SCHEDULED"
                          ? "✅ מתוכנן"
                          : therapySession.status === "COMPLETED"
                          ? "✅ הושלם"
                          : therapySession.status === "CANCELLED"
                          ? "🚫 בוטל"
                          : "❌ אי הופעה"}
                      </Badge>
                    </div>

                    {/* שורה 2: שם מטופל - קליקבלי */}
                    {therapySession.client ? (
                      <div>
                        <Link 
                          href={`/dashboard/clients/${therapySession.client.id}`}
                          className="text-lg font-semibold hover:text-primary hover:underline transition-colors cursor-pointer inline-block"
                        >
                          👤 {therapySession.client.name}
                        </Link>
                      </div>
                    ) : (
                      <div className="text-lg font-semibold text-muted-foreground">
                        🌊 הפסקה
                      </div>
                    )}

                    {/* שורה 3: אינדיקטורים (רק לפגישות שהושלמו) */}
                    {therapySession.status === "COMPLETED" && therapySession.client && (
                      <div className="flex items-center gap-4 text-sm pt-2 border-t">
                        {/* אינדיקטור תשלום */}
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">💵 תשלום:</span>
                          {therapySession.payment?.status === "PAID" ? (
                            <span className="text-green-600 font-medium">✓ שולם</span>
                          ) : (
                            <span className="text-orange-600 font-medium">⏳ לא שולם</span>
                          )}
                        </div>

                        {/* אינדיקטור סיכום */}
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">📝 סיכום:</span>
                          {therapySession.sessionNote ? (
                            <Link 
                              href={`/dashboard/sessions/${therapySession.id}`}
                              className="text-green-600 font-medium hover:text-green-700 hover:underline transition-colors"
                            >
                              ✓ נכתב
                            </Link>
                          ) : (
                            <Link 
                              href={`/dashboard/sessions/${therapySession.id}`}
                              className="text-blue-600 font-medium hover:text-blue-700 hover:underline transition-colors"
                            >
                              כתוב סיכום
                            </Link>
                          )}
                        </div>
                      </div>
                    )}

                    {/* שורה 3: אינדיקטורים (רק לאי הופעה/ביטול) */}
                    {(therapySession.status === "NO_SHOW" || therapySession.status === "CANCELLED") && therapySession.client && (
                      <div className="flex items-center gap-4 text-sm pt-2 border-t">
                        {/* אינדיקטור תשלום */}
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">💵 תשלום:</span>
                          {therapySession.payment?.status === "PAID" ? (
                            <span className="text-green-600 font-medium">✓ חויב</span>
                          ) : (
                            <span className="text-gray-600 font-medium">⏳ פטור</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* שורה 4: כפתור דווח סיום (רק לפגישות מתוכננות) */}
                    {therapySession.status === "SCHEDULED" && therapySession.client && (
                      <div className="flex justify-center pt-2">
                        <CompleteSessionDialog
                          sessionId={therapySession.id}
                          clientId={therapySession.client.id}
                          clientName={therapySession.client.name}
                          sessionPrice={Number(therapySession.price)}
                          creditBalance={Number(therapySession.client.creditBalance || 0)}
                        />
                      </div>
                    )}
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













