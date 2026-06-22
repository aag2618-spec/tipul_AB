// SecretaryHome — מסך נחיתה מותאם למזכיר/ה (front-desk).
//
// במקום דשבורד המטפל (כותרת "הפעילות שלך", כרטיס AI, "ממתינים לסיכום"),
// המזכיר/ה מקבל/ת מוקד יומי: פגישות היום + מחר של כל הקליניקה +
// "מה דורש טיפול" (רשימות מפורטות, לא רק מספרים) + פעולות מהירות לפי הרשאות.
// שום תוכן קליני אינו נטען כאן — ה-select מצומצם לשדות אדמיניסטרטיביים
// בלבד (שם/שעה/מטפל/סטטוס).
//
// בידוד: buildSessionWhere/buildPaymentWhere מחזירים scope ארגוני למזכירה,
// ו-buildPaymentWhere מחזיר deny-filter כשאין canViewPayments. Server Component.
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  CalendarClock,
  CalendarPlus,
  UserPlus,
  CreditCard,
  CalendarX2,
  CheckCircle2,
  DoorOpen,
  BellRing,
  BadgeCheck,
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
import { calculatePaidAmount } from "@/lib/payment-utils";
import { ContactActions } from "@/components/contact-actions";
import {
  SecretaryQuickActions,
  type QuickActionSession,
} from "@/components/dashboard/secretary-quick-actions";
import type { Prisma } from "@prisma/client";

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

// שורת פגישה אדמיניסטרטיבית — ללא שדות קליניים. משותפת ל"היום" ול"מחר".
// מועשרת בחיווי-דלפק: יצירת קשר (SMS/אימייל), חדר, אם נשלחה תזכורת, ותווית
// תשלום (רק כשלמזכירה יש canViewPayments — מחושב בשרת, payment לא נשלח ללקוח).
type AdminSessionRow = {
  id: string;
  startTime: Date;
  endTime: Date;
  type: string;
  status: string;
  cancellationRequestedAt: Date | null;
  location: string | null;
  reminderSent: boolean;
  paymentLabel: { text: string; cls: string } | null;
  client: { id: string; name: string | null; phone: string | null; email: string | null } | null;
  therapist: { id: string; name: string | null } | null;
};

// פגישה שעבר זמנה ועדיין SCHEDULED = לא עודכנה (לא הושלמה/בוטלה). אינדיקציה
// בלבד — למזכיר/ה אין כאן פעולת עדכון; רק הסטטוס משתנה. (תמיד false ל"מחר".)
function SessionRow({ s, now }: { s: AdminSessionRow; now: Date }) {
  const accent = getTherapistAccent(s.therapist?.id);
  const time = new Date(s.startTime).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });
  const isPastUnupdated = s.status === "SCHEDULED" && new Date(s.endTime) < now;
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40 transition-colors">
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
            {s.client.name || "מטופל/ת"}
          </Link>
        ) : (
          <span className="font-medium text-muted-foreground">ללא מטופל</span>
        )}
        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: accent }}
              aria-hidden="true"
            />
            {s.therapist?.name || "מטפל/ת"}
          </span>
          {s.location && (
            <span className="flex items-center gap-0.5">
              <DoorOpen className="h-3 w-3" aria-hidden />
              {s.location}
            </span>
          )}
          {s.reminderSent && (
            <span className="flex items-center gap-0.5" title="תזכורת נשלחה">
              <BellRing className="h-3 w-3" aria-hidden />
              תזכורת
            </span>
          )}
          {s.paymentLabel && (
            <span className={`flex items-center gap-0.5 ${s.paymentLabel.cls}`}>
              <BadgeCheck className="h-3 w-3" aria-hidden />
              {s.paymentLabel.text}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {s.cancellationRequestedAt && s.status === "SCHEDULED" && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            בקשת ביטול
          </Badge>
        )}
        <Badge
          className={
            isPastUnupdated
              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
              : STATUS_BADGE[s.status] || STATUS_BADGE.SCHEDULED
          }
        >
          {isPastUnupdated ? "⚠ לא עודכן" : STATUS_LABEL[s.status] || s.status}
        </Badge>
        {s.client && (
          <ContactActions
            clientId={s.client.id}
            clientName={s.client.name}
            phone={s.client.phone}
            email={s.client.email}
          />
        )}
      </div>
    </div>
  );
}

// select אדמיניסטרטיבי מועשר לשורות "היום"/"מחר" — בלי notes/topic (תוכן קליני).
// payment נטען לחישוב סטטוס-תשלום בשרת בלבד (לא נשלח ללקוח; מוצג רק עם הרשאה).
const SESSION_SELECT = {
  id: true,
  startTime: true,
  endTime: true,
  type: true,
  status: true,
  price: true,
  location: true,
  cancellationRequestedAt: true,
  client: { select: { id: true, name: true, phone: true, email: true } },
  therapist: { select: { id: true, name: true } },
  payment: {
    select: {
      status: true,
      amount: true,
      method: true,
      hasReceipt: true,
      childPayments: {
        where: { status: "PAID" as const },
        select: { amount: true, status: true },
      },
    },
  },
} satisfies Prisma.TherapySessionSelect;

async function getSecretaryData(scopeUser: ScopeUser) {
  const sessionWhere = buildSessionWhere(scopeUser);
  const canViewPayments = secretaryCan(scopeUser, "canViewPayments");

  // גבולות "היום" ו"מחר" בישראל כ-UTC — שאילתה ישירה בלי סינון post-query.
  const now = new Date();
  const { start: todayStart, end: todayEnd } = getIsraelDayBoundsUtc(now);
  const tomorrowRef = new Date(now);
  tomorrowRef.setDate(tomorrowRef.getDate() + 1);
  const { start: tomorrowStart, end: tomorrowEnd } = getIsraelDayBoundsUtc(tomorrowRef);
  // "בעוד יומיים" — עבור בורר התזכורות בכרטיס הפעולות המהירות.
  const dayAfterRef = new Date(now);
  dayAfterRef.setDate(dayAfterRef.getDate() + 2);
  const { start: dayAfterStart, end: dayAfterEnd } = getIsraelDayBoundsUtc(dayAfterRef);

  const [
    todaySessions,
    tomorrowSessions,
    dayAfterSessions,
    cancellationRequests,
    cancellationList,
    pendingPaymentsRaw,
  ] = await Promise.all([
    prisma.therapySession.findMany({
      where: {
        AND: [sessionWhere, { startTime: { gte: todayStart, lt: todayEnd } }],
      },
      select: SESSION_SELECT,
      orderBy: { startTime: "asc" },
    }),
    prisma.therapySession.findMany({
      where: {
        AND: [sessionWhere, { startTime: { gte: tomorrowStart, lt: tomorrowEnd } }],
      },
      select: SESSION_SELECT,
      orderBy: { startTime: "asc" },
    }),
    prisma.therapySession.findMany({
      where: {
        AND: [sessionWhere, { startTime: { gte: dayAfterStart, lt: dayAfterEnd } }],
      },
      select: SESSION_SELECT,
      orderBy: { startTime: "asc" },
    }),
    // בקשות ביטול שממתינות לטיפול — פגישות עם בקשה שעדיין מתוכננות (כל תאריך).
    prisma.therapySession.count({
      where: {
        AND: [
          sessionWhere,
          { cancellationRequestedAt: { not: null }, status: "SCHEDULED" },
        ],
      },
    }),
    // הרשימה עצמה (לא רק מספר) — 5 הקרובות, להצגה בכרטיס "מה דורש טיפול".
    prisma.therapySession.findMany({
      where: {
        AND: [
          sessionWhere,
          { cancellationRequestedAt: { not: null }, status: "SCHEDULED" },
        ],
      },
      select: {
        id: true,
        startTime: true,
        client: { select: { id: true, name: true } },
        therapist: { select: { name: true } },
      },
      orderBy: { startTime: "asc" },
      take: 5,
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
          select: {
            id: true,
            amount: true,
            expectedAmount: true,
            client: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve(
          [] as {
            id: string;
            amount: unknown;
            expectedAmount: unknown;
            client: { id: string; name: string | null } | null;
          }[]
        ),
  ]);

  // יתרה פתוחה לכל תשלום + סינון לאלו שבאמת חייבים, מהגדול לקטן.
  const openPayments = pendingPaymentsRaw
    .map((p) => ({
      id: p.id,
      client: p.client,
      remaining: (Number(p.expectedAmount) || 0) - (Number(p.amount) || 0),
    }))
    .filter((p) => p.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);

  // חיווי "תזכורת נשלחה" לשורות היום/מחר/יומיים — שאילתה אחת מקובצת (לא N+1).
  const dayIds = [...todaySessions, ...tomorrowSessions, ...dayAfterSessions].map(
    (s) => s.id,
  );
  const remindedRows = dayIds.length
    ? await prisma.communicationLog.findMany({
        where: {
          sessionId: { in: dayIds },
          type: { in: ["REMINDER_24H", "REMINDER_2H"] },
          status: "SENT",
        },
        select: { sessionId: true },
        distinct: ["sessionId"],
      })
    : [];
  const remindedSet = new Set(
    remindedRows.map((r) => r.sessionId).filter((id): id is string => !!id),
  );

  // מיפוי לשורה אדמיניסטרטיבית מועשרת. תווית התשלום מחושבת בשרת ורק עם
  // canViewPayments; אובייקט ה-payment עצמו לא עובר ל-SessionRow (אין דליפה).
  const mapRow = (s: (typeof todaySessions)[number]): AdminSessionRow => {
    let paymentLabel: AdminSessionRow["paymentLabel"] = null;
    if (canViewPayments && s.payment) {
      const paid = calculatePaidAmount({
        amount: s.payment.amount,
        status: s.payment.status,
        method: s.payment.method,
        hasReceipt: s.payment.hasReceipt,
        childPayments: s.payment.childPayments,
      });
      const priceNum = Number(s.price) || 0;
      if (s.payment.status === "PAID" || (paid > 0 && priceNum > 0 && paid >= priceNum)) {
        paymentLabel = { text: "שולם", cls: "text-emerald-600" };
      } else if (paid > 0) {
        paymentLabel = { text: "שולם חלקית", cls: "text-amber-600" };
      } else {
        paymentLabel = { text: "ממתין לתשלום", cls: "text-muted-foreground" };
      }
    }
    return {
      id: s.id,
      startTime: s.startTime,
      endTime: s.endTime,
      type: s.type,
      status: s.status,
      cancellationRequestedAt: s.cancellationRequestedAt,
      location: s.location,
      reminderSent: remindedSet.has(s.id),
      paymentLabel,
      client: s.client,
      therapist: s.therapist,
    };
  };

  return {
    todaySessions: todaySessions.map(mapRow),
    tomorrowSessions: tomorrowSessions.map(mapRow),
    dayAfterSessions: dayAfterSessions.map(mapRow),
    cancellationRequests,
    cancellationList,
    pendingPayments: openPayments.length,
    pendingPaymentsList: openPayments.slice(0, 5),
    canViewPayments,
  };
}

export async function SecretaryHome({
  scopeUser,
  userName,
}: {
  scopeUser: ScopeUser;
  userName?: string | null;
}) {
  const {
    todaySessions,
    tomorrowSessions,
    dayAfterSessions,
    cancellationRequests,
    cancellationList,
    pendingPayments,
    pendingPaymentsList,
    canViewPayments,
  } = await getSecretaryData(scopeUser);

  const canCreateClient = secretaryCan(scopeUser, "canCreateClient");
  const canSendReminders = secretaryCan(scopeUser, "canSendReminders");

  const todayLabel = new Date().toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jerusalem",
  });

  // "עכשיו" לזיהוי פגישות שעבר זמנן — מועבר ל-SessionRow.
  const now = new Date();

  // תאריך מחר (YYYY-MM-DD בישראל) — לקישור "ליומן" שקופץ ליום מחר.
  const tomorrowRef = new Date(now);
  tomorrowRef.setDate(tomorrowRef.getDate() + 1);
  const tomorrowParam = tomorrowRef.toLocaleDateString("en-CA", {
    timeZone: "Asia/Jerusalem",
  });
  const tomorrowLabel = tomorrowRef.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jerusalem",
  });

  // פגישות הלקוחות (ללא הפסקות) הן הליבה של המוקד.
  const clientSessions = todaySessions.filter((s) => s.type !== "BREAK");
  const tomorrowClientSessions = tomorrowSessions.filter((s) => s.type !== "BREAK");

  const hasExceptions = cancellationRequests > 0 || (canViewPayments && pendingPayments > 0);

  // תווית "בעוד יומיים" + נתוני פגישות לכרטיס הפעולות המהירות (שליחת תזכורות).
  // hasContact נגזר בשרת בלבד — טלפון/מייל אינם נשלחים ל-client (צמצום PHI).
  const dayAfterRef = new Date(now);
  dayAfterRef.setDate(dayAfterRef.getDate() + 2);
  const dayAfterLabel = dayAfterRef.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jerusalem",
  });
  const toQuickAction = (s: AdminSessionRow): QuickActionSession => ({
    id: s.id,
    time: new Date(s.startTime).toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jerusalem",
    }),
    clientName: s.client?.name || "מטופל/ת",
    therapistName: s.therapist?.name || "מטפל/ת",
    reminderSent: s.reminderSent,
    hasContact: !!(s.client?.phone || s.client?.email),
  });
  const tomorrowReminderRows = tomorrowClientSessions.map(toQuickAction);
  const dayAfterReminderRows = dayAfterSessions
    .filter((s) => s.type !== "BREAK")
    .map(toQuickAction);

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
            <Link href="/dashboard/calendar?new=true&scope=clinic">
              <CalendarPlus className="h-4 w-4 ml-2" />
              פגישה חדשה
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* עמודה שמאלית: פגישות היום + מחר */}
        <div className="lg:col-span-2 space-y-6">
          {/* פגישות היום בקליניקה */}
          <Card>
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
                      ? "פגישה אחת בלוח היום"
                      : `${clientSessions.length} פגישות בלוח היום`}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/calendar">ליומן</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {clientSessions.length > 0 ? (
                <div className="space-y-2">
                  {clientSessions.map((s) => (
                    <SessionRow key={s.id} s={s} now={now} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <Calendar className="mx-auto h-12 w-12 mb-3 opacity-50" />
                  <p>אין פגישות מתוכננות להיום</p>
                  <Button variant="link" asChild className="mt-2">
                    <Link href="/dashboard/calendar?new=true&scope=clinic">קביעת פגישה חדשה</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* פגישות מחר — להיערכות מוקדמת */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-5 w-5 text-primary" />
                  פגישות מחר
                </CardTitle>
                <CardDescription>
                  {tomorrowClientSessions.length === 0
                    ? tomorrowLabel
                    : `${tomorrowLabel} · ${tomorrowClientSessions.length} פגישות`}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/calendar?date=${tomorrowParam}`}>ליומן</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {tomorrowClientSessions.length > 0 ? (
                <div className="space-y-2">
                  {tomorrowClientSessions.map((s) => (
                    <SessionRow key={s.id} s={s} now={now} />
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  אין פגישות מתוכננות למחר
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* מה דורש טיפול + פעולות מהירות */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">מה דורש טיפול</CardTitle>
              <CardDescription>חריגים שכדאי לטפל בהם</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {cancellationRequests > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <CalendarX2 className="h-4 w-4 text-amber-600" />
                      בקשות ביטול
                    </span>
                    <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      {cancellationRequests}
                    </Badge>
                  </div>
                  {cancellationList.map((c) => {
                    const d = new Date(c.startTime);
                    const dateParam = d.toLocaleDateString("en-CA", {
                      timeZone: "Asia/Jerusalem",
                    });
                    const when = `${d.toLocaleDateString("he-IL", {
                      day: "2-digit",
                      month: "2-digit",
                      timeZone: "Asia/Jerusalem",
                    })} ${d.toLocaleTimeString("he-IL", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Jerusalem",
                    })}`;
                    return (
                      <Link
                        key={c.id}
                        href={`/dashboard/calendar?date=${dateParam}&highlight=${c.id}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-900/20 px-3 py-2 hover:bg-amber-100/60 transition-colors"
                      >
                        <span className="text-sm truncate">{c.client?.name || "מטופל/ת"}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{when}</span>
                      </Link>
                    );
                  })}
                  {cancellationRequests > cancellationList.length && (
                    <Link
                      href="/dashboard/calendar"
                      className="block px-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      + עוד {cancellationRequests - cancellationList.length} בקשות — ליומן
                    </Link>
                  )}
                </div>
              )}
              {canViewPayments && pendingPayments > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <CreditCard className="h-4 w-4 text-orange-600" />
                      תשלומים פתוחים
                    </span>
                    <Badge className="bg-orange-500/20 text-orange-700 dark:text-orange-300">
                      {pendingPayments}
                    </Badge>
                  </div>
                  {pendingPaymentsList.map((p) => (
                    <Link
                      key={p.id}
                      href="/dashboard/payments"
                      className="flex items-center justify-between gap-2 rounded-md border border-orange-200 bg-orange-50/60 dark:bg-orange-900/20 px-3 py-2 hover:bg-orange-100/60 transition-colors"
                    >
                      <span className="text-sm truncate">{p.client?.name || "מטופל/ת"}</span>
                      <span className="text-xs font-medium shrink-0">
                        ₪{Math.round(p.remaining).toLocaleString("he-IL")}
                      </span>
                    </Link>
                  ))}
                  {pendingPayments > pendingPaymentsList.length && (
                    <Link
                      href="/dashboard/payments"
                      className="block px-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      + עוד {pendingPayments - pendingPaymentsList.length} — לתשלומים
                    </Link>
                  )}
                </div>
              )}
              {!hasExceptions && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  הכל מסודר — אין חריגים כרגע
                </div>
              )}
            </CardContent>
          </Card>

          {/* פעולות מהירות אמיתיות (לא קישורי ניווט שכבר בתפריט הצד).
              שלב 1: שליחת תזכורות מחר/יומיים בבחירה פרטנית. */}
          <SecretaryQuickActions
            tomorrowLabel={tomorrowLabel}
            dayAfterLabel={dayAfterLabel}
            tomorrowSessions={tomorrowReminderRows}
            dayAfterSessions={dayAfterReminderRows}
            canSendReminders={canSendReminders}
          />
        </div>
      </div>
    </div>
  );
}
