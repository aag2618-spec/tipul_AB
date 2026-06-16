import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { SessionsView } from "@/components/sessions/sessions-view";
import { loadScopeUser, buildSessionWhere, isSecretary, isClinicOwner } from "@/lib/scope";
import { shouldScopePersonal } from "@/lib/view-scope";

// מונע cache leak בין מטפלים — דף מכיל PHI scoped למשתמש
export const dynamic = "force-dynamic";

async function getSessions(sessionWhere: Prisma.TherapySessionWhereInput, includeNote: boolean) {
  return prisma.therapySession.findMany({
    where: sessionWhere,
    orderBy: { startTime: "desc" },
    // No limit - load all sessions
    include: {
      client: { select: { id: true, name: true, isQuickClient: true } },
      // דף רב-מטפלים: שם המטפל/ת של הפגישה — לסימון (צבע + שם) במצב "כל הקליניקה".
      therapist: { select: { id: true, name: true } },
      // Privacy: secretary must NOT receive clinical note content.
      ...(includeNote ? { sessionNote: { select: { content: true } } } : {}),
      payment: { select: { id: true, status: true, amount: true, expectedAmount: true } },
    },
  });
}

export default async function SessionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const scopeUser = await loadScopeUser(session.user.id);
  const personalOnly = await shouldScopePersonal(scopeUser);
  const sessionWhere = buildSessionWhere(scopeUser, { personalOnly });
  const includeNote = !isSecretary(scopeUser);
  // סימון מטפל (צבע + שם) על הכרטיסים — רק לבעל/ת הקליניקה במצב "כל הקליניקה".
  // סימון מטפל: בעל/ת קליניקה במצב "כל הקליניקה", או מזכירה (שתמיד רואה את כל
  // הקליניקה ולכן צריכה לדעת של איזה מטפל כל פגישה). מטפל רגיל רואה רק את שלו.
  const showTherapist = (isClinicOwner(scopeUser) && !personalOnly) || isSecretary(scopeUser);

  const sessions = await getSessions(sessionWhere, includeNote);

  const serialized = sessions.map(s => {
    return {
      id: s.id,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      status: s.status,
      type: s.type,
      price: Number(s.price),
      // Privacy: topic is clinical content — strip for secretary.
      topic: includeNote ? s.topic : null,
      cancellationReason: s.cancellationReason,
      cancelledAt: s.cancelledAt?.toISOString() || null,
      sessionNote: includeNote ? (s.sessionNote?.content || null) : null,
      payment: s.payment ? { id: s.payment.id, status: s.payment.status, amount: Number(s.payment.amount), expectedAmount: Number(s.payment.expectedAmount) } : null,
      client: s.client ? { id: s.client.id, name: s.client.name, isQuickClient: s.client.isQuickClient } : null,
      therapistId: s.therapistId ?? null,
      therapistName: s.therapist?.name ?? null,
    };
  });

  // key לפי היקף התצוגה: כשהמתג "שלי / כל הקליניקה" מתחלף, ה-key משתנה
  // וה-SessionsView נטען מחדש עם הרשימה המסוננת מהשרת (אחרת useState "מקפיא"
  // את הרשימה הראשונה ולחיצה על "שלי" לא משנה כלום).
  return (
    <SessionsView
      key={personalOnly ? "personal" : "clinic"}
      initialSessions={serialized}
      showTherapist={showTherapist}
      // כפתור "התכונן" מקשר לדף ההכנה הקליני שחוסם מזכירה (404). מירור מדויק של אותו guard.
      canPrepare={!isSecretary(scopeUser)}
    />
  );
}
