import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import { checkCronAuth } from "@/lib/cron-auth";
import {
  resolveStaffTaskTargets,
  createStaffTaskBatch,
  type StaffAssignMode,
} from "@/lib/staff-tasks";

export const dynamic = "force-dynamic";

const WEEKDAY_MAP: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

// יוצר מופעי מטלה מתבניות חוזרות (DAILY/WEEKLY/MONTHLY). ה-scheduler מגביל
// אותו לחלון בוקר. אידמפוטנטי: לא יוצר מטלה שכבר נוצרה מאותה תבנית לאותו
// עובד באותו יום (חלון 20h — מכסה כמה ריצות באותו בוקר, ומתאפס למחרת).
export async function GET(request: NextRequest) {
  const guard = await checkCronAuth(request);
  if (guard) return guard;

  // לא יוצרים מטלות חדשות בשבת/חג; ייווצרו במוצאי שבת/חג.
  if (isShabbatOrYomTov()) {
    logger.info("[cron recurring-tasks] דילוג בשבת/חג");
    return NextResponse.json({ skipped: true, reason: "shabbat_or_yomtov" });
  }

  try {
    const now = new Date();
    // יום בשבוע (0=ראשון..6=שבת) ויום בחודש לפי שעון ישראל.
    const weekdayName = now.toLocaleDateString("en-US", {
      timeZone: "Asia/Jerusalem",
      weekday: "long",
    });
    const todayWeekday = WEEKDAY_MAP[weekdayName] ?? -1;
    const todayMonthday = parseInt(
      now.toLocaleDateString("en-US", {
        timeZone: "Asia/Jerusalem",
        day: "numeric",
      }),
      10
    );

    const templates = await prisma.taskTemplate.findMany({
      where: { active: true, recurrence: { not: "NONE" } },
    });

    // חלון dedup — 20 שעות אחורה. מונע יצירה כפולה באותו יום ומאפשר יצירה מחדש למחרת.
    const dedupSince = new Date(now.getTime() - 20 * 60 * 60 * 1000);

    let tasksCreated = 0;
    let batchesCreated = 0;

    for (const tpl of templates) {
      let dueToday = false;
      if (tpl.recurrence === "DAILY") dueToday = true;
      else if (tpl.recurrence === "WEEKLY")
        dueToday = tpl.recurrenceWeekday === todayWeekday;
      else if (tpl.recurrence === "MONTHLY")
        dueToday = tpl.recurrenceMonthday === todayMonthday;
      if (!dueToday) continue;

      const assigneeIds = Array.isArray(tpl.assigneeIds)
        ? (tpl.assigneeIds as string[])
        : [];
      const targetUserIds = await resolveStaffTaskTargets({
        organizationId: tpl.organizationId,
        assignMode: tpl.assignMode as StaffAssignMode,
        assigneeIds,
      });
      if (targetUserIds.length === 0) continue;

      // אידמפוטנטיות: סנן עובדים שכבר קיבלו מטלה מהתבנית הזו בחלון ה-dedup.
      const alreadyCreated = await prisma.task.findMany({
        where: {
          templateId: tpl.id,
          userId: { in: targetUserIds },
          createdAt: { gte: dedupSince },
        },
        select: { userId: true },
      });
      const alreadySet = new Set(alreadyCreated.map((t) => t.userId));
      const pending = targetUserIds.filter((uid) => !alreadySet.has(uid));
      if (pending.length === 0) continue;

      const { created } = await createStaffTaskBatch({
        targetUserIds: pending,
        assignedById: tpl.createdById,
        organizationId: tpl.organizationId,
        title: tpl.title,
        description: tpl.description,
        priority: tpl.priority,
        dueDate: null,
        templateId: tpl.id,
      });
      tasksCreated += created;
      batchesCreated += 1;
    }

    return NextResponse.json({
      message: "recurring tasks processed",
      templatesChecked: templates.length,
      batchesCreated,
      tasksCreated,
    });
  } catch (error) {
    logger.error("[cron recurring-tasks] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "Error processing recurring tasks" },
      { status: 500 }
    );
  }
}
