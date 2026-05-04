import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { TasksView } from "@/components/tasks/tasks-view";
import { loadScopeUser, buildSessionWhere } from "@/lib/scope";

async function getSessionsPendingSummary(sessionWhere: Prisma.TherapySessionWhereInput) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // Include COMPLETED without summary even if startTime is still "future" by server clock (timezone-safe).
  return prisma.therapySession.findMany({
    where: {
      AND: [
        sessionWhere,
        {
          startTime: { gte: thirtyDaysAgo },
          skipSummary: { not: true },
          type: { not: "BREAK" },
          status: "COMPLETED",
          sessionNote: { is: null },
        },
      ],
    },
    include: {
      client: { select: { id: true, name: true } },
    },
    orderBy: { startTime: "desc" },
  });
}

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const scopeUser = await loadScopeUser(session.user.id);
  const sessionWhere = buildSessionWhere(scopeUser);

  const pendingSessions = await getSessionsPendingSummary(sessionWhere);

  // Convert sessions to task-like format for TasksView
  const tasks = pendingSessions.map((s) => ({
    id: s.id,
    type: "WRITE_SUMMARY" as const,
    title: `כתוב סיכום - ${s.client?.name || "מטופל"}`,
    description: s.id,
    status: "PENDING" as const,
    priority: "MEDIUM" as const,
    dueDate: s.startTime.toISOString(),
    createdAt: s.startTime.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    userId: session.user.id,
    clientName: s.client?.name,
    sessionId: s.id,
    relatedEntityId: s.id,
    relatedEntity: "SESSION" as const,
  }));

  return <TasksView initialTasks={tasks} />;
}
