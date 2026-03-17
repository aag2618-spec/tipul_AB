import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

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
    const body = await request.json();

    // Verify task belongs to user
    const existingTask = await prisma.task.findFirst({
      where: { id, userId: userId },
    });

    if (!existingTask) {
      return NextResponse.json({ message: "משימה לא נמצאה" }, { status: 404 });
    }

    const { title, description, status, priority, dueDate, reminderAt } = body;

    const task = await prisma.task.update({
      where: { id },
      data: {
        title: title !== undefined ? title : existingTask.title,
        description: description !== undefined ? description : existingTask.description,
        status: status !== undefined ? status : existingTask.status,
        priority: priority !== undefined ? priority : existingTask.priority,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : existingTask.dueDate,
        reminderAt: reminderAt !== undefined ? (reminderAt ? new Date(reminderAt) : null) : existingTask.reminderAt,
      },
    });

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
