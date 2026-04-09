// Dashboard Page - Main Overview
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Calendar, CreditCard, Clock, Plus, Brain } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PersonalTasksWidget } from "@/components/tasks/personal-tasks-widget";
import { TodaySessionCard } from "@/components/dashboard/today-session-card";
import { SubBoxLink } from "@/components/dashboard-stat-card";
import { calculateDebtFromPayments } from "@/lib/payment-utils";

function getIsraelOffsetHours(date: Date): number {
  const dateStr = date.toISOString().split("T")[0];
  const testDate = new Date(`${dateStr}T12:00:00Z`);
  const israelHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(testDate)
  );
  return israelHour - 12;
}

function toIsraelTime(utcDate: Date): Date {
  const date = new Date(utcDate);
  date.setUTCHours(date.getUTCHours() + getIsraelOffsetHours(date));
  return date;
}

async function getDashboardStats(userId: string) {
  // SIMPLE SOLUTION: Use a wide time range to catch all sessions
  // This avoids complex timezone calculations
  const now = new Date();
  
  // Get yesterday at 00:00 UTC
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  today.setUTCDate(today.getUTCDate() - 1);
  
  // Get tomorrow at 23:59 UTC (48 hour window)
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 3);
  
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
    archivedClients,
    sessionsThisWeek,
    sessionsThisMonth,
    pendingPaymentsRaw,
    pendingTasks,
    todaySessions,
    todaySessionPreps,
  ] = await Promise.all([
    prisma.client.count({ where: { therapistId: userId } }),
    prisma.client.count({ where: { therapistId: userId, status: "ACTIVE" } }),
    prisma.client.count({ where: { therapistId: userId, status: "WAITING" } }),
    prisma.client.count({ where: { therapistId: userId, status: { in: ["INACTIVE", "ARCHIVED"] } } }),
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
    // Fetch pending payments to properly filter only truly unpaid ones
    prisma.payment.findMany({
      where: {
        client: { therapistId: userId },
        status: "PENDING",
        parentPaymentId: null,
      },
      select: {
        amount: true,
        expectedAmount: true,
      },
    }),
    // Count sessions pending summary (last 30 days only).
    // Only COMPLETED sessions should appear as pending summary.
    prisma.therapySession.count({
      where: {
        therapistId: userId,
        startTime: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        skipSummary: { not: true },
        type: { not: "BREAK" },
        status: "COMPLETED",
        sessionNote: { is: null },
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
        cancellationReason: true,
        sessionNote: {
          select: {
            id: true,
            content: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
            creditBalance: true,
            payments: {
              where: { status: "PENDING" },
              select: {
                expectedAmount: true,
                amount: true,
              },
            },
          },
        },
        payment: {
          select: {
            id: true,
            status: true,
            amount: true,
            expectedAmount: true,
          },
        },
      },
      orderBy: { startTime: "asc" },
    }),
    // הכנות לפגישות שנוצרו היום
    prisma.sessionPrep.findMany({
      where: {
        userId,
        createdAt: { gte: today, lt: tomorrow },
      },
      select: {
        id: true,
        clientId: true,
        createdAt: true,
      },
    }),
  ]);

  // Filter sessions to only show TODAY in Israel time
  const filteredTodaySessions = todaySessions.filter(session => {
    const sessionDate = new Date(session.startTime);
    const sessionOffsetMs = getIsraelOffsetHours(sessionDate) * 60 * 60 * 1000;
    const nowOffsetMs = getIsraelOffsetHours(now) * 60 * 60 * 1000;

    const sessionIsraelTime = new Date(sessionDate.getTime() + sessionOffsetMs);
    const nowIsraelTime = new Date(now.getTime() + nowOffsetMs);

    return (
      sessionIsraelTime.getUTCFullYear() === nowIsraelTime.getUTCFullYear() &&
      sessionIsraelTime.getUTCMonth() === nowIsraelTime.getUTCMonth() &&
      sessionIsraelTime.getUTCDate() === nowIsraelTime.getUTCDate()
    );
  });

  // DEBUG: Log found sessions
  console.log('📅 All sessions in range:', todaySessions.length);
  console.log('📅 Filtered today sessions:', filteredTodaySessions.map(s => ({
    id: s.id,
    client: s.client?.name,
    startTime: s.startTime.toISOString(),
  })));

  // יצירת מפת הכנות לפי clientId
  const prepsByClientId = new Map(
    todaySessionPreps.map(prep => [prep.clientId, prep])
  );

  // הוספת מידע על הכנות לפגישות
  const sessionsWithPreps = filteredTodaySessions.map(session => ({
    ...session,
    hasPrep: session.client ? prepsByClientId.has(session.client.id) : false,
  }));

  const pendingPayments = pendingPaymentsRaw.filter((p) => {
    const paid = Number(p.amount);
    const expected = Number(p.expectedAmount) || 0;
    return expected > 0 && paid < expected;
  }).length;

  return {
    totalClients,
    activeClients,
    waitingClientsCount,
    archivedClients,
    sessionsThisWeek,
    sessionsThisMonth,
    pendingPayments,
    pendingTasks,
    todaySessions: sessionsWithPreps,
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
      bgColor: "bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-950/30 dark:to-sky-900/30",
      iconColor: "text-sky-600",
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
      description: "",
      icon: Calendar,
      href: "/dashboard/calendar",
      bgColor: "bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30",
      iconColor: "text-green-600",
      subBox: {
        value: stats.sessionsThisMonth,
        label: "תצוגת חודש",
        bgColor: "bg-gradient-to-br from-green-500 to-green-600 dark:from-green-600 dark:to-green-700",
        textColor: "text-white dark:text-white",
        href: "/dashboard/calendar?view=month",
      },
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
      title: "ממתינים לסיכום",
      value: stats.pendingTasks,
      description: "פגישות לסיכום",
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
          <Link href="/dashboard/calendar?new=true">
            <Plus className="h-4 w-4 ml-2" />
            פגישה חדשה
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className={`group relative overflow-hidden ${stat.bgColor} cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-xl`}>
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

      {/* Today's Sessions & AI Prep */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's Sessions */}
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
                {stats.todaySessions.map((therapySession) => {
                  const totalDebt = therapySession.client?.payments
                    ? calculateDebtFromPayments(therapySession.client.payments)
                    : 0;
                  const unpaidSessionsCount = therapySession.client?.payments.length || 0;

                  return (
                    <TodaySessionCard 
                      key={therapySession.id} 
                      session={{
                        id: therapySession.id,
                        startTime: therapySession.startTime,
                        endTime: therapySession.endTime,
                        type: therapySession.type as string,
                        status: therapySession.status as string,
                        price: Number(therapySession.price),
                        cancellationReason: therapySession.cancellationReason,
                        sessionNote: therapySession.sessionNote?.content || null,
                        payment: therapySession.payment ? {
                          id: therapySession.payment.id,
                          status: therapySession.payment.status as string,
                          amount: Number(therapySession.payment.amount),
                          expectedAmount: Number(therapySession.payment.expectedAmount),
                        } : null,
                        client: therapySession.client ? {
                          id: therapySession.client.id,
                          name: therapySession.client.name,
                          creditBalance: Number(therapySession.client.creditBalance),
                          totalDebt: totalDebt,
                          unpaidSessionsCount: unpaidSessionsCount,
                        } : null,
                      }} 
                    />
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="mx-auto h-12 w-12 mb-3 opacity-50" />
                <p>אין פגישות מתוכננות להיום</p>
                <Button variant="link" asChild className="mt-2">
                  <Link href="/dashboard/calendar?new=true">קבע פגישה חדשה</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Session Prep - What to work on today */}
        <Card className="bg-gradient-to-br from-purple-50 to-sky-50 dark:from-purple-950/30 dark:to-sky-900/30 border-purple-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                AI - מה לעבוד היום
              </CardTitle>
              <CardDescription>הכנה חכמה לפגישות שלך</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/ai-prep">פרטים מלאים</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats.todaySessions.length > 0 ? (
              <div className="space-y-4">
                {stats.todaySessions
                  .filter(s => s.client) // Only sessions with clients
                  .slice(0, 3) // Show max 3
                  .map((session) => {
                    const hasPrep = session.hasPrep;
                    return (
                      <div 
                        key={session.id}
                        className={`p-4 bg-white dark:bg-slate-800 rounded-lg border ${
                          hasPrep 
                            ? 'border-green-200 dark:border-green-800' 
                            : 'border-purple-100 dark:border-purple-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-sm">
                            {session.client?.name}
                          </h4>
                          <div className="flex items-center gap-2">
                            {hasPrep && (
                              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                                ✓ הכנה מוכנה
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {new Date(session.startTime).toLocaleTimeString('he-IL', { 
                                hour: '2-digit', 
                                minute: '2-digit',
                                timeZone: 'Asia/Jerusalem'
                              })}
                            </Badge>
                          </div>
                        </div>
                        {hasPrep ? (
                          <div className="space-y-2 text-sm text-muted-foreground">
                            <div className="flex items-start gap-2">
                              <span className="text-green-600">✓</span>
                              <span>הכנה מוכנה לפגישה עם {session.client?.name}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-green-600">📋</span>
                              <span>לחץ לצפייה בהמלצות ושאלות</span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2 text-sm text-muted-foreground">
                            <div className="flex items-start gap-2">
                              <span className="text-purple-600">🧠</span>
                              <span>הכנה חכמה לפגישה עם {session.client?.name}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-sky-600">📋</span>
                              <span>ניתוח הפגישות האחרונות וזיהוי דפוסים</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-green-600">💡</span>
                              <span>המלצות ושאלות מותאמות לפגישה</span>
                            </div>
                          </div>
                        )}
                        <Button 
                          variant="default" 
                          size="sm" 
                          className={`mt-3 ${
                            hasPrep 
                              ? 'bg-green-600 hover:bg-green-700' 
                              : 'bg-purple-600 hover:bg-purple-700'
                          }`}
                          asChild
                        >
                          <Link href={`/dashboard/sessions/${session.id}`}>
                            {hasPrep ? '📖 הצג הכנה לפגישה' : '🤖 צור הכנה לפגישה'}
                          </Link>
                        </Button>
                      </div>
                    );
                  })}
                {stats.todaySessions.filter(s => s.client).length > 3 && (
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href="/dashboard/ai-prep">
                      עוד {stats.todaySessions.filter(s => s.client).length - 3} פגישות →
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Brain className="mx-auto h-12 w-12 mb-3 opacity-50" />
                <p>אין פגישות מתוכננות להיום</p>
                <p className="text-xs mt-2">כשיהיו פגישות, תראה כאן המלצות AI מותאמות אישית</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Personal Tasks Widget */}
      <Suspense fallback={<div className="text-center py-4 text-muted-foreground">טוען משימות...</div>}>
        <PersonalTasksWidget />
      </Suspense>
    </div>
  );
}
