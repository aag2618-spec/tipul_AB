import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { TasksView } from "@/components/tasks/tasks-view";

async function getTasks(userId: string) {
  const now = new Date();
  return prisma.task.findMany({
    where: {
      userId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
      OR: [
        { type: { not: "WRITE_SUMMARY" } },
        { type: "WRITE_SUMMARY", dueDate: { lte: now } },
      ],
    },
    orderBy: [
      { dueDate: "desc" },
      { createdAt: "desc" },
    ],
  });
}

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const tasks = await getTasks(session.user.id);

  return <TasksView initialTasks={tasks} />;
}
