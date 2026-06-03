import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { SessionsView } from "@/components/sessions/sessions-view";
import { loadScopeUser, buildSessionWhere, isSecretary } from "@/lib/scope";
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
      // Privacy: secretary must NOT receive clinical note content.
      ...(includeNote ? { sessionNote: { select: { content: true } } } : {}),
      payment: { select: { id: true, status: true, amount: true, expectedAmount: true } },
    },
  });
}

async function getPreparedSessionKeys(userId: string): Promise<Set<string>> {
  const preps = await prisma.sessionPrep.findMany({
    where: { userId },
    select: { clientId: true, sessionDate: true },
  });
  // יוצר מפתח ייחודי: clientId + תאריך (בלי שעה)
  return new Set(preps.map(p => `${p.clientId}_${p.sessionDate.toISOString().slice(0, 10)}`));
}

export default async function SessionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const scopeUser = await loadScopeUser(session.user.id);
  const personalOnly = await shouldScopePersonal(scopeUser);
  const sessionWhere = buildSessionWhere(scopeUser, { personalOnly });
  const includeNote = !isSecretary(scopeUser);

  const [sessions, prepKeys] = await Promise.all([
    getSessions(sessionWhere, includeNote),
    getPreparedSessionKeys(session.user.id),
  ]);

  const serialized = sessions.map(s => {
    const sessionDateKey = s.client ? `${s.client.id}_${s.startTime.toISOString().slice(0, 10)}` : "";
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
      hasPrepReady: prepKeys.has(sessionDateKey),
    };
  });

  // key לפי היקף התצוגה: כשהמתג "שלי / כל הקליניקה" מתחלף, ה-key משתנה
  // וה-SessionsView נטען מחדש עם הרשימה המסוננת מהשרת (אחרת useState "מקפיא"
  // את הרשימה הראשונה ולחיצה על "שלי" לא משנה כלום).
  return (
    <SessionsView
      key={personalOnly ? "personal" : "clinic"}
      initialSessions={serialized}
    />
  );
}
