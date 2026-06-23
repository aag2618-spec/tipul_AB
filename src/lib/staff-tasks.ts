// Helpers משותפים למטלות צוות — נצרכים גם ע"י POST /api/clinic-admin/tasks
// (יצירה ידנית) וגם ע"י /api/cron/recurring-tasks (יצירת מופעי מטלה חוזרת),
// כדי שלוגיקת ה-resolve וה-fan-out לא תתפצל לעותקים out-of-sync.

import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import type { Prisma, Priority } from "@prisma/client";

export type StaffAssignMode =
  | "SPECIFIC"
  | "ALL_THERAPISTS"
  | "ALL_SECRETARIES"
  | "ALL_STAFF";

// מחזיר את רשימת ה-userIds שיקבלו את המטלה — תמיד מסונן לארגון + לא חסומים
// (בידוד ארגוני). ב-SPECIFIC: רק assigneeIds שבאמת חברי הארגון (מסנן זרים).
export async function resolveStaffTaskTargets(params: {
  organizationId: string;
  assignMode: StaffAssignMode;
  assigneeIds?: string[] | null;
}): Promise<string[]> {
  const { organizationId, assignMode, assigneeIds } = params;
  const where: Prisma.UserWhereInput = { organizationId, isBlocked: false };
  if (assignMode === "SPECIFIC") {
    where.id = { in: assigneeIds ?? [] };
  } else if (assignMode === "ALL_THERAPISTS") {
    where.clinicRole = { in: ["OWNER", "THERAPIST"] };
  } else if (assignMode === "ALL_SECRETARIES") {
    where.clinicRole = "SECRETARY";
  } else {
    where.clinicRole = { in: ["OWNER", "THERAPIST", "SECRETARY"] };
  }
  const users = await prisma.user.findMany({ where, select: { id: true } });
  return users.map((u) => u.id);
}

// יוצר מטלת צוות (Task + Notification בפעמון) לכל נמען, עם batchId משותף.
// כל נמען מקבל רשומת Task נפרדת (userId=הנמען) כדי שהווידג'ט הקיים יציג אותה
// והעובד יסמן "בוצע" בנפרד.
export async function createStaffTaskBatch(params: {
  targetUserIds: string[];
  assignedById: string;
  organizationId: string;
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: Date | null;
  templateId?: string | null;
  batchId?: string;
}): Promise<{ batchId: string; created: number }> {
  const batchId = params.batchId ?? randomUUID();
  const now = new Date();

  const tasksData: Prisma.TaskCreateManyInput[] = params.targetUserIds.map(
    (uid) => ({
      userId: uid,
      assignedById: params.assignedById,
      organizationId: params.organizationId,
      type: "STAFF_TASK",
      title: params.title,
      description: params.description,
      priority: params.priority,
      dueDate: params.dueDate,
      batchId,
      templateId: params.templateId ?? null,
      status: "PENDING",
    })
  );

  const notificationsData: Prisma.NotificationCreateManyInput[] =
    params.targetUserIds.map((uid) => ({
      userId: uid,
      type: "PENDING_TASKS",
      title: `מטלה חדשה מהקליניקה: ${params.title}`,
      content: params.description || params.title,
      status: "PENDING",
      sentAt: now,
    }));

  await prisma.$transaction([
    prisma.task.createMany({ data: tasksData }),
    prisma.notification.createMany({ data: notificationsData }),
  ]);

  return { batchId, created: params.targetUserIds.length };
}
