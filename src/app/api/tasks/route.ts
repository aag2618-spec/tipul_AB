import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { parseIsraelTime } from "@/lib/date-utils";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const withReminders = searchParams.get("withReminders");
    const history = searchParams.get("history");

    const where: Record<string, unknown> = { userId: session.user.id };

    if (history === "true") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      where.type = "CUSTOM";
      where.status = { in: ["COMPLETED", "DISMISSED"] };
      where.updatedAt = { gte: thirtyDaysAgo };

      const tasks = await prisma.task.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }],
      });
      return NextResponse.json(tasks);
    }

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    if (withReminders === "true") {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      where.reminderAt = {
        gte: now,
        lte: tomorrow,
      };
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [
        { priority: "desc" },
        { dueDate: "asc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Get tasks error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המשימות" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { type, title, description, priority, dueDate, reminderAt, relatedEntityId, relatedEntity } = body;

    if (!title) {
      return NextResponse.json(
        { message: "כותרת המשימה היא שדה חובה" },
        { status: 400 }
      );
    }

    const task = await prisma.task.create({
      data: {
        userId: session.user.id,
        type: type || "CUSTOM",
        title,
        description: description || null,
        priority: priority || "MEDIUM",
        dueDate: dueDate ? parseIsraelTime(dueDate) : null,
        reminderAt: reminderAt ? parseIsraelTime(reminderAt) : null,
        relatedEntityId: relatedEntityId || null,
        relatedEntity: relatedEntity || null,
        status: "PENDING",
      },
    });

    // Create a bell notification so it shows up immediately
    await prisma.notification.create({
      data: {
        userId: session.user.id,
        type: "PENDING_TASKS",
        title: `מטלה חדשה: ${title}`,
        content: reminderAt
          ? `תזכורת מתוזמנת ל-${new Date(parseIsraelTime(reminderAt)).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}`
          : description || title,
        status: "PENDING",
        sentAt: new Date(),
      },
    }).catch((err) => console.error("Failed to create task notification:", err));

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Create task error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת המשימה" },
      { status: 500 }
    );
  }
}
