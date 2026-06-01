// SecretaryHome — מסך נחיתה מותאם למזכיר/ה (front-desk).
//
// במקום דשבורד המטפל (כותרת "הפעילות שלך", כרטיס AI, "ממתינים לסיכום"),
// המזכיר/ה מקבל/ת מוקד יומי: פגישות היום של כל הקליניקה + "מה דורש טיפול" +
// פעולות מהירות לפי הרשאות. שום תוכן קליני אינו נטען כאן —
// ה-select מצומצם לשדות אדמיניסטרטיביים בלבד (שם/שעה/מטפל/סטטוס).
//
// בידוד: buildSessionWhere/buildPaymentWhere מחזירים scope ארגוני למזכירה,
// ו-buildPaymentWhere מחזיר deny-filter כשאין canViewPayments. Server Component.
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  CalendarPlus,
  UserPlus,
  CreditCard,
  CalendarX2,
  CheckCircle2,
  MessagesSquare,
  Bell,
} from "lucide-react";
import prisma from "@/lib/prisma";
import {
  buildSessionWhere,
  buildPaymentWhere,
  secretaryCan,
  type ScopeUser,
} from "@/lib/scope";
import { EXCLUDE_BULK_UMBRELLA_WHERE } from "@/lib/payments/types";
import { getTherapistAccent } from "@/lib/calendar/event-colors";
import { getIsraelDayBoundsUtc } from "@/lib/timezone";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "מתוכננת",
  COMPLETED: "הושלמה",
  CANCELLED: "בוטלה",
  NO_SHOW: "לא הגיע/ה",
  PENDING_APPROVAL: "ממתינה לאישור",
};

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  COMPLETED: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  NO_SHOW: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const TYPE_LABEL: Record<string, string> = {
  IN_PERSON: "פרונטלי",
  ONLINE: "אונליין",
  PHONE: "טלפון",
  BREAK: "הפסקה",
};

async function getSecretaryData(scopeUser: ScopeUser) {
  const sessionWhere = buildSessionWhere(scopeUser);
  const canViewPayments = secretaryCan(scopeUser, "canViewPayments");

  // גבולות "היום בישראל" כ-UTC — שאילתה ישירה בלי סינון post-query.
  const { start: todayStart, end: todayEnd } = getIsraelDayBoundsUtc(new Date());

  const [todaySessions, cancellationRequests, pendingPaymentsRaw] = await Promise.all([
    prisma.therapySession.findMany({
      where: {
        AND: [sessionWhere, { startTime: { gte: todayStart, lt: todayEnd } }],
      },
      // select אדמיניסטרטיבי בלבד — ללא notes/topic (תוכן קליני).
      select: {
        id: true,
        startTime: true,
        endTime: true,
        type: true,
        status: true,
        cancellationRequestedAt: true,
        client: { select: { id: true, name: true } },
        therapist: { select: { id: true, name: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    // בקשות ביטול שממתינות לטיפול — פגישות עם בקשה שעדיין מתוכננות.
    prisma.therapySession.count({
      where: {
        AND: [
          sessionWhere,
          { cancellationRequestedAt: { not: null }, status: "SCHEDULED" },
        ],
      },
    }),
    // תשלומים פתוחים — רק אם למזכירה יש canViewPayments (אחרת deny-filter
    // מחזיר ריק ממילא, אבל נמנעים מהשאילתה).
    canViewPayments
      ? prisma.payment.findMany({
          where: {
            AND: [
              buildPaymentWhere(scopeUser),
              EXCLUDE_BULK_UMBRELLA_WHERE,
              { status: "PENDING", parentPaymentId: null },
            ],
          },
          select: { amount: true, expectedAmount: true },
        })
      : Promise.resolve([] as { amount: unknown; expectedAmount: unknown }[]),
  ]);

  const pendingPayments = pendingPaymentsRaw.filter((p) => {
    const paid = Number(p.amount) || 0;
    const expected = Number(p.expectedAmount) || 0;
    return expected > 0 && paid < expected;
  }).length;

  return { todaySessions, cancellationRequests, pendingPayments, canViewPayments };
}

export async function SecretaryHome({
  scopeUser,
  userName,
}: {
  scopeUser: ScopeUser;
  userName?: string | null;
}) {
  const { todaySessions, cancellationRequests, pendingPayments, canViewPayments } =
    await getSecretaryData(scopeUser);

  const canCreateClient = secretaryCan(scopeUser, "canCreateClient");
  const canSendReminders = secretaryCan(scopeUser, "canSendReminders");

  const todayLabel = new Date().toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jerusalem",
  });

  // פגישות הלקוחות (ללא הפסקות) הן הליבה של המוקד.
  const clientSessions = todaySessions.filter((s) => s.type !== "BREAK");

  const hasExceptions = cancellationRequests > 0 || (canViewPayments && pendingPayments > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">
            {userName ? `שלום, ${userName}` : "מוקד הקליניקה"}
          </h1>
          <p className="text-muted-foreground mt-1">מוקד הקליניקה · {todayLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreateClient && (
            <Button asChild variant="outline">
              <Link href="/dashboard/clients/new">
                <UserPlus className="h-4 w-4 ml-2" />
                מטופל חדש
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/dashboard/calendar?new=true">
              <CalendarPlus className="h-4 w-4 ml-2" />
              פגישה חדשה
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* פגישות היום בקליניקה */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                פגישות היום בקליניקה
              </CardTitle>
              <CardDescription>
                {clientSessions.length === 0
                  ? "לוח הפגישות של כל המטפלים"
                  : clientSessions.length === 1
                    ? "פגישה אחת מתוכננת היום"
                    : `${clientSessions.length} פגישות מתוכננות היום`}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/calendar">ליומן</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {clientSessions.length > 0 ? (
              <div className="space-y-2">
                {clientSessions.map((s) => {
                  const accent = getTherapistAccent(s.therapist?.id);
                  const time = new Date(s.startTime).toLocaleTimeString("he-IL", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Jerusalem",
                  });
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40 transition-colors"
                    >
                      {/* פס צבע מטפל */}
                      <span
                        className="h-9 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: accent }}
                        aria-hidden="true"
                      />
                      <div className="flex flex-col items-center justify-center w-14 shrink-0">
                        <span className="text-sm font-bold">{time}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {TYPE_LABEL[s.type] || "פרונטלי"}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        {s.client ? (
                          <Link
                            href={`/dashboard/clients/${s.client.id}`}
                            className="font-medium truncate hover:text-primary hover:underline inline-block max-w-full"
                          >
                            {s.client.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-muted-foreground">ללא מטופל</span>
                        )}
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <span
                            className="inline-block h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: accent }}
                            aria-hidden="true"
                          />
                          {s.therapist?.name || "מטפל/ת"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {s.cancellationRequestedAt && s.status === "SCHEDULED" && (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            בקשת ביטול
                          </Badge>
                        )}
                        <Badge className={STATUS_BADGE[s.status] || STATUS_BADGE.SCHEDULED}>
                          {STATUS_LABEL[s.status] || s.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <Calendar className="mx-auto h-12 w-12 mb-3 opacity-50" />
                <p>אין פגישות מתוכננות להיום</p>
                <Button variant="link" asChild className="mt-2">
                  <Link href="/dashboard/calendar?new=true">קביעת פגישה חדשה</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* מה דורש טיפול + פעולות מהירות */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">מה דורש טיפול</CardTitle>
              <CardDescription>חריגים שכדאי לטפל בהם</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {cancellationRequests > 0 && (
                <Link
                  href="/dashboard/calendar"
                  className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-900/20 p-3 hover:bg-amber-100/60 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <CalendarX2 className="h-4 w-4 text-amber-600" />
                    בקשות ביטול
                  </span>
                  <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    {cancellationRequests}
                  </Badge>
                </Link>
              )}
              {canViewPayments && pendingPayments > 0 && (
                <Link
                  href="/dashboard/payments"
                  className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50/60 dark:bg-orange-900/20 p-3 hover:bg-orange-100/60 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <CreditCard className="h-4 w-4 text-orange-600" />
                    תשלומים פתוחים
                  </span>
                  <Badge className="bg-orange-500/20 text-orange-700 dark:text-orange-300">
                    {pendingPayments}
                  </Badge>
                </Link>
              )}
              {!hasExceptions && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  הכל מסודר — אין חריגים כרגע
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">פעולות מהירות</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/calendar">
                  <Calendar className="h-4 w-4 ml-2" />
                  יומן הקליניקה
                </Link>
              </Button>
              {canSendReminders && (
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/dashboard/communications">
                    <Bell className="h-4 w-4 ml-2" />
                    שליחת תזכורות
                  </Link>
                </Button>
              )}
              {canViewPayments && (
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/dashboard/payments">
                    <CreditCard className="h-4 w-4 ml-2" />
                    תשלומים
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/dashboard/team-chat">
                  <MessagesSquare className="h-4 w-4 ml-2" />
                  צ׳אט צוות
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
