import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    const task = await prisma.task.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!task) {
      return NextResponse.json({ message: "משימה לא נמצאה" }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error("Get task error:", error);
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Verify task belongs to user
    const existingTask = await prisma.task.findFirst({
      where: { id, userId: session.user.id },
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
    console.error("Update task error:", error);
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    // Verify task belongs to user
    const existingTask = await prisma.task.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existingTask) {
      return NextResponse.json({ message: "משימה לא נמצאה" }, { status: 404 });
    }

    await prisma.task.delete({ where: { id } });

    return NextResponse.json({ message: "המשימה נמחקה" });
  } catch (error) {
    console.error("Delete task error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת המשימה" },
      { status: 500 }
    );
  }
}
