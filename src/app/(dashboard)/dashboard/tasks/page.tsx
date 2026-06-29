import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { TasksView } from "@/components/tasks/tasks-view";
import { buildSessionWhere, isSecretary, isClinicOwner } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { shouldScopePersonal } from "@/lib/view-scope";

// מונע cache leak בין מטפלים — דף מכיל PHI scoped למשתמש
export const dynamic = "force-dynamic";

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
      therapist: { select: { id: true, name: true } },
    },
    orderBy: { startTime: "desc" },
  });
}

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const scopeUser = await loadScopeUserWithMode(session.user.id);

  // B6: מזכירה בקליניקה — הדף הזה הוא "פגישות ממתינות לסיכום" שזה זרימה
  // קלינית של המטפל. buildSessionWhere למזכירה מחזיר את כל הארגון (כי היא
  // מורשית לאדמיניסטרציה), ובלי הגייט הזה היא היתה רואה רשימה של פגישות
  // עם שמות מטופלים של כל המטפלים בקליניקה ("כתוב סיכום – פלוני") — דליפת
  // metadata אדמיניסטרטיבית-קלינית. הדף לא רלוונטי לתפקידה — מציגים מצב
  // ריק (TasksView יציג "אין פגישות ממתינות לסיכום").
  if (isSecretary(scopeUser)) {
    return <TasksView initialTasks={[]} />;
  }

  // היקף לפי המתג "שלי / כל הקליניקה". לבעל/ת קליניקה ב"שלי" → רק הפגישות שלו/ה
  // שממתינות לסיכום; ב"כל הקליניקה" → של כל המטפלים. לשאר התפקידים — ללא שינוי.
  const personalOnly = await shouldScopePersonal(scopeUser);
  const sessionWhere = buildSessionWhere(scopeUser, { personalOnly });
  const pendingSessions = await getSessionsPendingSummary(sessionWhere);

  // נקודת-צבע + שם מטפל מוצגים רק לבעל/ת קליניקה במצב "כל הקליניקה".
  const showTherapist = isClinicOwner(scopeUser) && !personalOnly;

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
    therapistId: s.therapist?.id ?? null,
    therapistName: s.therapist?.name ?? null,
    sessionId: s.id,
    relatedEntityId: s.id,
    relatedEntity: "SESSION" as const,
  }));

  return (
    <TasksView
      key={personalOnly ? "personal" : "clinic"}
      initialTasks={tasks}
      showTherapist={showTherapist}
    />
  );
}
