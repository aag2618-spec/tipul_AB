import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// This endpoint should be called by a cron job (Vercel Cron, Render Cron, or external service)
// Set up in vercel.json or cron-job.org to call daily

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
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

    let notificationsCreated = 0;

    for (const user of users) {
      const settings = user.notificationSettings[0];
      if (!settings) continue;

      // Morning summary - today's sessions
      const todaySessions = await prisma.therapySession.findMany({
        where: {
          therapistId: user.id,
          startTime: { gte: today, lt: tomorrow },
          status: "SCHEDULED",
        },
        include: { client: true },
        orderBy: { startTime: "asc" },
      });

      if (todaySessions.length > 0) {
        const sessionsList = todaySessions
          .map((s) => `• ${s.client.name} - ${new Date(s.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`)
          .join("\n");

        await prisma.notification.create({
          data: {
            userId: user.id,
            type: "MORNING_SUMMARY",
            title: `תזכורת בוקר - ${today.toLocaleDateString("he-IL")}`,
            content: `יש לך ${todaySessions.length} פגישות היום:\n${sessionsList}`,
            status: "PENDING",
            scheduledFor: now,
          },
        });
        notificationsCreated++;
      }

      // Evening summary - tomorrow's sessions
      const tomorrowSessions = await prisma.therapySession.findMany({
        where: {
          therapistId: user.id,
          startTime: { gte: tomorrow, lt: dayAfterTomorrow },
          status: "SCHEDULED",
        },
        include: { client: true },
        orderBy: { startTime: "asc" },
      });

      // Pending tasks
      const pendingTasks = await prisma.task.findMany({
        where: {
          userId: user.id,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        orderBy: { priority: "desc" },
        take: 10,
      });

      if (tomorrowSessions.length > 0 || pendingTasks.length > 0) {
        const sessionsList = tomorrowSessions
          .map((s) => `• ${s.client.name} - ${new Date(s.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`)
          .join("\n");

        const tasksList = pendingTasks
          .slice(0, 5)
          .map((t) => `• ${t.title}`)
          .join("\n");

        await prisma.notification.create({
          data: {
            userId: user.id,
            type: "EVENING_SUMMARY",
            title: `סיכום ליום מחר - ${tomorrow.toLocaleDateString("he-IL")}`,
            content: `פגישות מחר (${tomorrowSessions.length}):\n${sessionsList || "אין פגישות"}\n\nמשימות פתוחות (${pendingTasks.length}):\n${tasksList || "אין משימות"}`,
            status: "PENDING",
            scheduledFor: now,
          },
        });
        notificationsCreated++;
      }

      // Payment reminders
      const debtThreshold = settings.debtThresholdDays || 30;
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - debtThreshold);

      const pendingPayments = await prisma.payment.findMany({
        where: {
          client: { therapistId: user.id },
          status: "PENDING",
          createdAt: { lt: thresholdDate },
        },
        include: { client: true },
      });

      if (pendingPayments.length > 0) {
        const totalDebt = pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0);

        await prisma.notification.create({
          data: {
            userId: user.id,
            type: "PAYMENT_REMINDER",
            title: `תזכורת: ${pendingPayments.length} תשלומים ממתינים`,
            content: `יש לך ${pendingPayments.length} תשלומים שממתינים מעל ${debtThreshold} ימים בסך ₪${totalDebt.toLocaleString()}`,
            status: "PENDING",
            scheduledFor: now,
          },
        });
        notificationsCreated++;
      }

      // Monthly payment collection reminder (e.g., 25th of month)
      const monthlyReminderDay = (settings as { monthlyReminderDay?: number }).monthlyReminderDay;
      if (monthlyReminderDay && now.getDate() === monthlyReminderDay) {
        const allPendingPayments = await prisma.payment.findMany({
          where: {
            client: { therapistId: user.id },
            status: "PENDING",
          },
          include: { client: true },
        });

        if (allPendingPayments.length > 0) {
          const totalAmount = allPendingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
          
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: "PAYMENT_REMINDER",
              title: `תזכורת גבייה חודשית`,
              content: `סוף החודש מתקרב! יש לגבות ${allPendingPayments.length} תשלומים בסך ₪${totalAmount.toLocaleString()}`,
              status: "PENDING",
              scheduledFor: now,
            },
          });
          notificationsCreated++;
        }
      }
    }

    return NextResponse.json({ 
      message: "Notifications generated", 
      count: notificationsCreated 
    });
  } catch (error) {
    console.error("Cron notifications error:", error);
    return NextResponse.json(
      { message: "Error generating notifications" },
      { status: 500 }
    );
  }
}







