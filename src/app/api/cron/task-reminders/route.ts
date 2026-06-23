import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

// תזכורת על מטלות צוות שעבר תאריך היעד שלהן וטרם בוצעו: התראה בפעמון לעובד
// וגם למקצה. אידמפוטנטי דרך Task.overdueReminderAt (פעם אחת בלבד לכל מטלה).
export async function GET(request: NextRequest) {
  const guard = await checkCronAuth(request);
  if (guard) return guard;

  if (isShabbatOrYomTov()) {
    logger.info("[cron task-reminders] דילוג בשבת/חג");
    return NextResponse.json({ skipped: true, reason: "shabbat_or_yomtov" });
  }

  try {
    const now = new Date();
    const overdue = await prisma.task.findMany({
      where: {
        type: "STAFF_TASK",
        status: "PENDING",
        dueDate: { lt: now },
        assignedById: { not: null },
        overdueReminderAt: null, // dedup — טרם נשלחה תזכורת איחור
      },
    });

    let notified = 0;
    for (const task of overdue) {
      // התראה לעובד שאליו הוקצתה המטלה.
      await prisma.notification.create({
        data: {
          userId: task.userId,
          type: "PENDING_TASKS",
          title: `מטלה באיחור: ${task.title}`,
          content: `המטלה "${task.title}" עברה את תאריך היעד וטרם סומנה כבוצעה.`,
          status: "PENDING",
          sentAt: now,
        },
      });

      // יידוע המקצה (אם קיים ושונה מהעובד עצמו).
      if (task.assignedById && task.assignedById !== task.userId) {
        await prisma.notification.create({
          data: {
            userId: task.assignedById,
            type: "PENDING_TASKS",
            title: "מטלה באיחור אצל עובד",
            content: `המטלה "${task.title}" שהקצית עברה את תאריך היעד וטרם בוצעה.`,
            status: "PENDING",
            sentAt: now,
          },
        });
      }

      // סימון שנשלחה תזכורת — מונע שליחה חוזרת בריצות הבאות.
      await prisma.task.update({
        where: { id: task.id },
        data: { overdueReminderAt: now },
      });
      notified += 1;
    }

    return NextResponse.json({
      message: "task reminders processed",
      overdueFound: overdue.length,
      notified,
    });
  } catch (error) {
    logger.error("[cron task-reminders] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "Error processing task reminders" },
      { status: 500 }
    );
  }
}
