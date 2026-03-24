import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { calculateDebtFromPayments } from "@/lib/payment-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ message: "CRON_SECRET not configured" }, { status: 503 });
    }
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const now = new Date();
    // Israel-aware today/tomorrow boundaries
    const israelDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const israelNoon = new Date(`${israelDateStr}T12:00:00Z`);
    const israelHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false }).format(israelNoon));
    const offsetHours = israelHour - 12;
    const offsetStr = offsetHours >= 0 ? `+${String(offsetHours).padStart(2, '0')}:00` : `-${String(Math.abs(offsetHours)).padStart(2, '0')}:00`;
    const today = new Date(`${israelDateStr}T00:00:00${offsetStr}`);
    const tomorrow = new Date(`${israelDateStr}T00:00:00${offsetStr}`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    // Get all users with enabled notifications
    const users = await prisma.user.findMany({
      where: {
        notificationSettings: {
          some: { enabled: true },
        },
      },
      include: {
        notificationSettings: true,
      },
    });

    for (const user of users) {
      // Get tomorrow's sessions
      const tomorrowSessions = await prisma.therapySession.findMany({
        where: {
          therapistId: user.id,
          startTime: { gte: tomorrow, lt: dayAfterTomorrow },
          status: "SCHEDULED",
        },
        include: { client: true },
        orderBy: { startTime: "asc" },
      });

      // Get pending tasks
      const pendingTasks = await prisma.task.findMany({
        where: {
          userId: user.id,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        orderBy: { priority: "desc" },
        take: 10,
      });

      // Get pending payments
      const debtThreshold = user.notificationSettings[0]?.debtThresholdDays || 30;
      const thresholdDate = new Date(today);
      thresholdDate.setDate(thresholdDate.getDate() - debtThreshold);

      const pendingPayments = await prisma.payment.findMany({
        where: {
          client: { therapistId: user.id },
          status: "PENDING",
          parentPaymentId: null,
          createdAt: { lt: thresholdDate },
        },
        include: { client: true },
      });

      // Create evening summary notification (for tomorrow) — skip if already sent today
      const alreadySentEvening = await prisma.notification.findFirst({
        where: { userId: user.id, type: "EVENING_SUMMARY", createdAt: { gte: today } },
      });

      if (!alreadySentEvening && (tomorrowSessions.length > 0 || pendingTasks.length > 0)) {
        const sessionsList = tomorrowSessions
          .filter((s) => s.client)
          .map((s) => `• ${s.client!.name} - ${new Date(s.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: 'Asia/Jerusalem' })}`)
          .join("\n");

        const tasksList = pendingTasks
          .slice(0, 5)
          .map((t) => `• ${t.title}`)
          .join("\n");

        await prisma.notification.create({
          data: {
            userId: user.id,
            type: "EVENING_SUMMARY",
            title: `סיכום ליום מחר - ${tomorrow.toLocaleDateString("he-IL", { timeZone: 'Asia/Jerusalem' })}`,
            content: `
פגישות מחר (${tomorrowSessions.length}):
${sessionsList || "אין פגישות מתוכננות"}

משימות פתוחות (${pendingTasks.length}):
${tasksList || "אין משימות"}
${pendingTasks.length > 5 ? `\n...ועוד ${pendingTasks.length - 5} משימות` : ""}
            `.trim(),
            status: "PENDING",
            scheduledFor: now,
          },
        });
      }

      // Create payment reminder if there are overdue payments — skip if already sent today
      // סינון רק תשלומים שבאמת חייבים כסף (סכום צפוי > 0 וטרם שולם במלואו)
      const realPendingPayments = pendingPayments.filter((p) => {
        const paid = Number(p.amount);
        const expected = Number(p.expectedAmount) || 0;
        return expected > 0 && paid < expected;
      });

      if (realPendingPayments.length > 0) {
        const alreadySentPayment = await prisma.notification.findFirst({
          where: { userId: user.id, type: "PAYMENT_REMINDER", createdAt: { gte: today } },
        });

        if (!alreadySentPayment) {
          const totalDebt = calculateDebtFromPayments(realPendingPayments);

          await prisma.notification.create({
            data: {
              userId: user.id,
              type: "PAYMENT_REMINDER",
              title: `תזכורת: ${realPendingPayments.length} תשלומים ממתינים`,
              content: `יש לך ${realPendingPayments.length} תשלומים שממתינים מעל ${debtThreshold} ימים בסך ₪${totalDebt}`,
              status: "PENDING",
              scheduledFor: now,
            },
          });
        }
      }
    }

    return NextResponse.json({ message: "Notifications generated successfully" });
  } catch (error) {
    logger.error("Generate notifications error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Error generating notifications" },
      { status: 500 }
    );
  }
}













