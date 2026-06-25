import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { assignTaskSchema } from "@/lib/validations/staff-task";
import { parseIsraelTime } from "@/lib/date-utils";
import { canManageStaffTasks, isClinicOwner, loadScopeUser } from "@/lib/scope";
import {
  createStaffTaskBatch,
  resolveStaffTaskTargets,
} from "@/lib/staff-tasks";
import {
  checkRateLimit,
  rateLimitResponse,
  STAFF_TASK_ASSIGN_RATE_LIMIT,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// ===== טיפוסי תשובת לוח-המעקב (GET) =====
type AssigneeRow = {
  taskId: string;
  userId: string;
  name: string | null;
  status: string;
  seenAt: Date | null;
  completedAt: Date | null;
  completionNote: string | null;
  overdue: boolean;
  commentCount: number;
};
type TaskGroup = {
  batchId: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: Date | null;
  createdAt: Date;
  assignedByName: string | null;
  assignees: AssigneeRow[];
  counts: { total: number; completed: number; seen: number; overdue: number };
};

// POST /api/clinic-admin/tasks — יצירת מטלת צוות + fan-out לכל הנמענים.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    if (!scopeUser.organizationId || !canManageStaffTasks(scopeUser)) {
      return NextResponse.json(
        { message: "אין הרשאה ליצור מטלות צוות" },
        { status: 403 }
      );
    }
    const organizationId = scopeUser.organizationId;

    // הגבלת קצב — מונע לולאת יצירה / הצפת DB+התראות (fan-out, security review rank 5).
    const rl = checkRateLimit(
      `staff-task:assign:${userId}`,
      STAFF_TASK_ASSIGN_RATE_LIMIT
    );
    if (!rl.allowed) return rateLimitResponse(rl);

    const parsed = await parseBody(request, assignTaskSchema);
    if ("error" in parsed) return parsed.error;
    const { title, description, priority, dueDate, assignMode, assigneeIds } =
      parsed.data;

    // resolve רשימת הנמענים — מסונן לארגון + לא חסומים (בידוד ארגוני), משותף
    // עם ה-cron של מטלות חוזרות (src/lib/staff-tasks.ts).
    const targetUserIds = await resolveStaffTaskTargets({
      organizationId,
      assignMode: assignMode || "SPECIFIC",
      assigneeIds,
    });
    if (targetUserIds.length === 0) {
      return NextResponse.json(
        { message: "לא נמצאו עובדים מתאימים לשליחה" },
        { status: 400 }
      );
    }

    const due =
      typeof dueDate === "string" && dueDate ? parseIsraelTime(dueDate) : null;
    const desc =
      typeof description === "string" && description.trim() ? description : null;

    const { batchId, created } = await createStaffTaskBatch({
      targetUserIds,
      assignedById: userId,
      organizationId,
      title: title.trim(),
      description: desc,
      priority: priority || "MEDIUM",
      dueDate: due,
    });

    return NextResponse.json({ created, batchId }, { status: 201 });
  } catch (error) {
    logger.error("[clinic-admin/tasks] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת מטלת הצוות" },
      { status: 500 }
    );
  }
}

// GET /api/clinic-admin/tasks — לוח מעקב: מטלות הצוות של הארגון, מקובצות לפי batch.
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    if (!scopeUser.organizationId || !canManageStaffTasks(scopeUser)) {
      return NextResponse.json(
        { message: "אין הרשאה לצפות במטלות צוות" },
        { status: 403 }
      );
    }

    const tasks = await prisma.task.findMany({
      where: {
        organizationId: scopeUser.organizationId,
        type: "STAFF_TASK",
        // הגנת PHI: מזכירה רואה רק מטלות שהיא עצמה הקצתה — לא מטלות שהמנהלת
        // הקצתה למטפלים (שה-completionNote שלהן עלול להכיל תוכן קליני). בעלים
        // רואה את כל מטלות הארגון. עקבי עם deny-by-default של המערכת.
        ...(isClinicOwner(scopeUser) ? {} : { assignedById: userId }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true } },
        assignedBy: { select: { id: true, name: true } },
        // מונה הערות לכל מטלה — להצגת "הערות (N)" בלוח בלי fetch מקדים לכל שורה.
        _count: { select: { comments: true } },
      },
    });

    // קיבוץ לפי batchId — כל batch = "מטלה אחת" שנשלחה לעובד אחד או לכמה.
    const now = Date.now();
    const groups = new Map<string, TaskGroup>();
    for (const t of tasks) {
      const key = t.batchId || t.id;
      let g = groups.get(key);
      if (!g) {
        g = {
          batchId: key,
          title: t.title,
          description: t.description,
          priority: t.priority,
          dueDate: t.dueDate,
          createdAt: t.createdAt,
          assignedByName: t.assignedBy?.name ?? null,
          assignees: [],
          counts: { total: 0, completed: 0, seen: 0, overdue: 0 },
        };
        groups.set(key, g);
      }
      const isCompleted = t.status === "COMPLETED";
      const isOverdue =
        !isCompleted &&
        t.status === "PENDING" &&
        t.dueDate != null &&
        new Date(t.dueDate).getTime() < now;
      g.assignees.push({
        taskId: t.id,
        userId: t.userId,
        name: t.user?.name ?? null,
        status: t.status,
        seenAt: t.seenAt,
        completedAt: t.completedAt,
        completionNote: t.completionNote,
        overdue: isOverdue,
        commentCount: t._count.comments,
      });
      g.counts.total += 1;
      if (isCompleted) g.counts.completed += 1;
      if (t.seenAt) g.counts.seen += 1;
      if (isOverdue) g.counts.overdue += 1;
    }

    return NextResponse.json(
      JSON.parse(JSON.stringify(Array.from(groups.values())))
    );
  } catch (error) {
    logger.error("[clinic-admin/tasks] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת מטלות הצוות" },
      { status: 500 }
    );
  }
}
