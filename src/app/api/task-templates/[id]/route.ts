import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { taskTemplateSchema } from "@/lib/validations/staff-task";
import { canManageStaffTasks, loadScopeUser } from "@/lib/scope";

export const dynamic = "force-dynamic";

// PATCH /api/task-templates/[id] — עדכון תבנית (כולל השהיה/הפעלה דרך active).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const scopeUser = await loadScopeUser(auth.userId);
    if (!scopeUser.organizationId || !canManageStaffTasks(scopeUser)) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }
    const { id } = await params;

    // בידוד ארגוני — התבנית חייבת להיות של הארגון של המשתמש.
    const existing = await prisma.taskTemplate.findFirst({
      where: { id, organizationId: scopeUser.organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ message: "התבנית לא נמצאה" }, { status: 404 });
    }

    const parsed = await parseBody(request, taskTemplateSchema);
    if ("error" in parsed) return parsed.error;
    const d = parsed.data;

    const template = await prisma.taskTemplate.update({
      where: { id },
      data: {
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
    return NextResponse.json(JSON.parse(JSON.stringify(template)));
  } catch (error) {
    logger.error("[task-templates/id] PATCH error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בעדכון התבנית" },
      { status: 500 }
    );
  }
}

// DELETE /api/task-templates/[id] — מחיקת תבנית. deleteMany עם בידוד ארגוני
// (count=0 → לא נמצאה/לא שייכת לארגון).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const scopeUser = await loadScopeUser(auth.userId);
    if (!scopeUser.organizationId || !canManageStaffTasks(scopeUser)) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }
    const { id } = await params;
    const result = await prisma.taskTemplate.deleteMany({
      where: { id, organizationId: scopeUser.organizationId },
    });
    if (result.count === 0) {
      return NextResponse.json({ message: "התבנית לא נמצאה" }, { status: 404 });
    }
    return NextResponse.json({ message: "התבנית נמחקה" });
  } catch (error) {
    logger.error("[task-templates/id] DELETE error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה במחיקת התבנית" },
      { status: 500 }
    );
  }
}
