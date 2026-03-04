import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { SessionsView } from "@/components/sessions/sessions-view";

async function getSessions(userId: string) {
  return prisma.therapySession.findMany({
    where: { therapistId: userId },
    orderBy: { startTime: "desc" },
    // No limit - load all sessions
    include: {
      client: { select: { id: true, name: true } },
    },
  });
}

export default async function SessionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const sessions = await getSessions(session.user.id);

  const serialized = sessions.map(s => ({
    id: s.id,
    startTime: s.startTime.toISOString(),
    endTime: s.endTime.toISOString(),
    status: s.status,
    type: s.type,
    price: Number(s.price),
    cancellationReason: s.cancellationReason,
    cancelledAt: s.cancelledAt?.toISOString() || null,
    client: s.client ? { id: s.client.id, name: s.client.name } : null,
  }));

  return <SessionsView initialSessions={serialized} />;
}
