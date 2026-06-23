import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { taskTemplateSchema } from "@/lib/validations/staff-task";
import { canManageStaffTasks, loadScopeUser } from "@/lib/scope";

export const dynamic = "force-dynamic";

// GET /api/task-templates — תבניות המטלה של הארגון (פעילות תחילה).
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const scopeUser = await loadScopeUser(auth.userId);
    if (!scopeUser.organizationId || !canManageStaffTasks(scopeUser)) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }
    const templates = await prisma.taskTemplate.findMany({
      where: { organizationId: scopeUser.organizationId },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(JSON.parse(JSON.stringify(templates)));
  } catch (error) {
    logger.error("[task-templates] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת התבניות" },
      { status: 500 }
    );
  }
}

// POST /api/task-templates — יצירת תבנית (לשליחה חוזרת ידנית או מטלה חוזרת).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const scopeUser = await loadScopeUser(auth.userId);
    if (!scopeUser.organizationId || !canManageStaffTasks(scopeUser)) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const parsed = await parseBody(request, taskTemplateSchema);
    if ("error" in parsed) return parsed.error;
    const d = parsed.data;

    const template = await prisma.taskTemplate.create({
      data: {
        organizationId: scopeUser.organizationId,
        createdById: auth.userId,
        title: d.title.trim(),
        description: d.description?.trim() || null,
        priority: d.priority || "MEDIUM",
        recurrence: d.recurrence || "NONE",
        recurrenceWeekday:
          d.recurrence === "WEEKLY" ? d.recurrenceWeekday ?? null : null,
        recurrenceMonthday:
          d.recurrence === "MONTHLY" ? d.recurrenceMonthday ?? null : null,
        active: d.active ?? true,
        assignMode: d.assignMode || "SPECIFIC",
        assigneeIds: d.assigneeIds ?? [],
      },
    });
    return NextResponse.json(JSON.parse(JSON.stringify(template)), {
      status: 201,
    });
  } catch (error) {
    logger.error("[task-templates] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה ביצירת התבנית" },
      { status: 500 }
    );
  }
}
