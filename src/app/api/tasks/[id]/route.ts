import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { updateTaskSchema } from "@/lib/validations/task";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    const task = await prisma.task.findFirst({
      where: { id, userId: userId },
    });

    if (!task) {
      return NextResponse.json({ message: "משימה לא נמצאה" }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    logger.error("Get task error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המשימה" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;
    // H12: zod אוכף caps + enum על status/priority. כל השדות אופציונליים (PATCH).
    const parsed = await parseBody(request, updateTaskSchema);
    if ("error" in parsed) return parsed.error;
    const { title, description, status, priority, dueDate, reminderAt, completionNote, markSeen } = parsed.data;

    // Verify task belongs to user — userId הוא הבעלים/assignee, כך שרק העובד
    // שאליו הוקצתה המטלה יכול לסמן "בוצע" / לכתוב הערת ביצוע / לסמן "נצפה".
    const existingTask = await prisma.task.findFirst({
      where: { id, userId: userId },
      // שם העובד — לתוכן התראת "בוצע" למקצה (A4). userId=המבצע ⇒ user=המבצע.
      include: { user: { select: { name: true } } },
    });

    if (!existingTask) {
      return NextResponse.json({ message: "משימה לא נמצאה" }, { status: 404 });
    }

    // מטלת צוות: title/description/priority/dueDate "שייכים" למקצה (המנהלת/מזכירה)
    // ונעולים לעובד — מתעלמים בשקט מניסיון לשנותם (אותו PATCH משמש גם ל-status/
    // markSeen הנשלחים לבד, אז 400 היה שובר אותם). מטלה אישית (CUSTOM) נשארת
    // עריכה מלאה ע"י הבעלים. reminderAt נשאר פתוח — זו תזכורת אישית של העובד.
    const isStaffTask = existingTask.type === "STAFF_TASK";
    const nowDate = new Date();
    const task = await prisma.task.update({
      where: { id },
      data: {
        title: isStaffTask
          ? existingTask.title
          : title !== undefined ? title : existingTask.title,
        description: isStaffTask
          ? existingTask.description
          : description !== undefined ? description : existingTask.description,
        status: status !== undefined ? status : existingTask.status,
        priority: isStaffTask
          ? existingTask.priority
          : priority !== undefined ? priority : existingTask.priority,
        dueDate: isStaffTask
          ? existingTask.dueDate
          : dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : existingTask.dueDate,
        reminderAt: reminderAt !== undefined ? (reminderAt ? new Date(reminderAt) : null) : existingTask.reminderAt,
        // מטלות צוות: "מה ביצעתי ואיך" (אופציונלי), חותמת השלמה, ואישור צפייה.
        completionNote: completionNote !== undefined ? completionNote : existingTask.completionNote,
        completedAt:
          status === "COMPLETED"
            ? existingTask.completedAt ?? nowDate
            : status !== undefined
              ? null
              : existingTask.completedAt,
        seenAt: markSeen && !existingTask.seenAt ? nowDate : existingTask.seenAt,
      },
    });

    // חיווי "בוצע" למקצה — רק במעבר הראשון ל-COMPLETED של מטלת-צוות (התנאי
    // existingTask.status !== "COMPLETED" מונע כפילות ב-PATCH חוזר). best-effort.
    // ⚠️ ללא completionNote (PHI) ב-content — הפרטים זמינים בדף עם ה-gate.
    if (
      isStaffTask &&
      status === "COMPLETED" &&
      existingTask.status !== "COMPLETED" &&
      existingTask.assignedById &&
      existingTask.assignedById !== userId
    ) {
      try {
        await prisma.notification.create({
          data: {
            userId: existingTask.assignedById,
            type: "STAFF_TASK_DONE",
            title: `מטלה בוצעה: ${existingTask.title}`,
            content: `${existingTask.user?.name || "עובד/ת"} סימן/ה את המטלה כבוצעה [task:${id}]`,
            status: "PENDING",
            sentAt: new Date(),
          },
        });
      } catch (notifyError) {
        logger.error("Staff task done notification failed:", {
          error:
            notifyError instanceof Error
              ? notifyError.message
              : String(notifyError),
        });
      }
    }

    return NextResponse.json(task);
  } catch (error) {
    logger.error("Update task error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון המשימה" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    // Verify task belongs to user
    const existingTask = await prisma.task.findFirst({
      where: { id, userId: userId },
    });

    if (!existingTask) {
      return NextResponse.json({ message: "משימה לא נמצאה" }, { status: 404 });
    }

    await prisma.task.update({
      where: { id },
      data: { status: "DISMISSED", updatedAt: new Date() },
    });

    return NextResponse.json({ message: "המשימה נמחקה" });
  } catch (error) {
    logger.error("Delete task error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת המשימה" },
      { status: 500 }
    );
  }
}
