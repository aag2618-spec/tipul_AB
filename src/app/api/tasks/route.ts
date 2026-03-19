import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { parseIsraelTime } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const withReminders = searchParams.get("withReminders");
    const history = searchParams.get("history");

    const where: Record<string, unknown> = { userId };

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
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(tasks);
  } catch (error) {
    logger.error("Get tasks error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המשימות" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

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
        userId,
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
        userId,
        type: "PENDING_TASKS",
        title: `מטלה חדשה: ${title}`,
        content: reminderAt
          ? `תזכורת מתוזמנת ל-${new Date(parseIsraelTime(reminderAt)).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}`
          : description || title,
        status: "PENDING",
        sentAt: new Date(),
      },
    }).catch((err) => logger.error("Failed to create task notification:", { error: err instanceof Error ? err.message : String(err) }));

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    logger.error("Create task error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת המשימה" },
      { status: 500 }
    );
  }
}
