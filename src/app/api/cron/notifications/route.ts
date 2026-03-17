import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { calculateDebtFromPayments } from "@/lib/payment-utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const summaryType = request.nextUrl.searchParams.get("type");
  const sendMorning = !summaryType || summaryType === "morning";
  const sendEvening = !summaryType || summaryType === "evening";

  try {
    const now = new Date();
    const israelDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    const israelNoon = new Date(`${israelDateStr}T12:00:00Z`);
    const israelHour = parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hour: "numeric", hour12: false }).format(israelNoon)
    );
    const offsetHours = israelHour - 12;
    const offsetStr =
      offsetHours >= 0
        ? `+${String(offsetHours).padStart(2, "0")}:00`
        : `-${String(Math.abs(offsetHours)).padStart(2, "0")}:00`;
    const today = new Date(`${israelDateStr}T00:00:00${offsetStr}`);
    const tomorrow = new Date(`${israelDateStr}T00:00:00${offsetStr}`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    // Include users with notifications enabled OR users who never configured settings (default = on)
    const users = await prisma.user.findMany({
      where: {
        email: { not: null },
        OR: [
          { notificationSettings: { some: { enabled: true } } },
          { notificationSettings: { none: {} } },
        ],
      },
      include: {
        notificationSettings: true,
      },
    });

    let notificationsCreated = 0;

    for (const user of users) {
      // Skip users who explicitly disabled email notifications
      const emailSetting = user.notificationSettings.find((s) => s.channel === "email");
      if (emailSetting && !emailSetting.enabled) continue;

      const settings = user.notificationSettings[0] || { debtThresholdDays: 30 };
      const shouldSendEmail = !!user.email;

      // ── Morning summary ──
      if (sendMorning) {
        // Duplicate prevention: skip if we already created a morning summary today
        const alreadySentMorning = await prisma.notification.findFirst({
          where: { userId: user.id, type: "MORNING_SUMMARY", createdAt: { gte: today } },
        });

        if (!alreadySentMorning) {
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
            const realSessions = todaySessions.filter((s) => s.client);
            const sessionsList = realSessions
              .map(
                (s) =>
                  `• ${s.client!.name} - ${new Date(s.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}`
              )
              .join("\n");

            const title = `תזכורת בוקר - ${today.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}`;
            const content = `יש לך ${realSessions.length} פגישות היום:\n${sessionsList}`;

            await prisma.notification.create({
              data: {
                userId: user.id,
                type: "MORNING_SUMMARY",
                title,
                content,
                status: "PENDING",
                scheduledFor: now,
              },
            });
            notificationsCreated++;

            if (shouldSendEmail) {
              const sessionsHtml = realSessions
                .map(
                  (s) =>
                    `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${s.client!.name}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;" dir="ltr">${new Date(s.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}</td></tr>`
                )
                .join("");

              await sendEmail({
                to: user.email!,
                subject: title,
                html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#0d9488;">☀️ ${title}</h2>
                  <p>שלום ${user.name || ""},</p>
                  <p>יש לך <strong>${realSessions.length} פגישות</strong> היום:</p>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                    <thead><tr><th style="text-align:right;padding:6px 12px;background:#f0fdfa;border-bottom:2px solid #0d9488;">מטופל</th><th style="text-align:right;padding:6px 12px;background:#f0fdfa;border-bottom:2px solid #0d9488;">שעה</th></tr></thead>
                    <tbody>${sessionsHtml}</tbody>
                  </table>
                  <p style="color:#6b7280;font-size:13px;margin-top:24px;">מייל זה נשלח אוטומטית ממערכת MyTipul</p>
                </div>`,
              }).catch(() => {});
            }
          }

          // Old debt threshold notification (piggy-backed on morning run)
          const debtThreshold = (settings as { debtThresholdDays?: number }).debtThresholdDays || 30;
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

          if (pendingPayments.length > 0) {
            const totalDebt = calculateDebtFromPayments(pendingPayments);

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
        }
      }

      // ── Evening summary ──
      if (sendEvening) {
        const alreadySentEvening = await prisma.notification.findFirst({
          where: { userId: user.id, type: "EVENING_SUMMARY", createdAt: { gte: today } },
        });

        if (!alreadySentEvening) {
          const tomorrowSessions = await prisma.therapySession.findMany({
            where: {
              therapistId: user.id,
              startTime: { gte: tomorrow, lt: dayAfterTomorrow },
              status: "SCHEDULED",
            },
            include: { client: true },
            orderBy: { startTime: "asc" },
          });

          const pendingTasks = await prisma.task.findMany({
            where: {
              userId: user.id,
              status: { in: ["PENDING", "IN_PROGRESS"] },
            },
            orderBy: { priority: "desc" },
            take: 10,
          });

          if (tomorrowSessions.length > 0 || pendingTasks.length > 0) {
            const realTomorrowSessions = tomorrowSessions.filter((s) => s.client);
            const sessionsList = realTomorrowSessions
              .map(
                (s) =>
                  `• ${s.client!.name} - ${new Date(s.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}`
              )
              .join("\n");

            const tasksList = pendingTasks
              .slice(0, 5)
              .map((t) => `• ${t.title}`)
              .join("\n");

            const title = `סיכום ליום מחר - ${tomorrow.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}`;
            const content = `פגישות מחר (${realTomorrowSessions.length}):\n${sessionsList || "אין פגישות"}\n\nמשימות פתוחות (${pendingTasks.length}):\n${tasksList || "אין משימות"}`;

            await prisma.notification.create({
              data: {
                userId: user.id,
                type: "EVENING_SUMMARY",
                title,
                content,
                status: "PENDING",
                scheduledFor: now,
              },
            });
            notificationsCreated++;

            if (shouldSendEmail) {
              const sessionsHtml =
                realTomorrowSessions.length > 0
                  ? realTomorrowSessions
                      .map(
                        (s) =>
                          `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${s.client!.name}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;" dir="ltr">${new Date(s.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}</td></tr>`
                      )
                      .join("")
                  : `<tr><td colspan="2" style="padding:12px;text-align:center;color:#6b7280;">אין פגישות מחר</td></tr>`;
              const tasksHtml =
                pendingTasks.length > 0
                  ? pendingTasks
                      .slice(0, 5)
                      .map((t) => `<li style="margin-bottom:4px;">${t.title}</li>`)
                      .join("")
                  : `<li style="color:#6b7280;">אין משימות פתוחות</li>`;

              await sendEmail({
                to: user.email!,
                subject: title,
                html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#0d9488;">🌙 ${title}</h2>
                  <p>שלום ${user.name || ""},</p>
                  <h3 style="margin-top:20px;">פגישות מחר (${realTomorrowSessions.length})</h3>
                  <table style="width:100%;border-collapse:collapse;margin:12px 0;">
                    <thead><tr><th style="text-align:right;padding:6px 12px;background:#f0fdfa;border-bottom:2px solid #0d9488;">מטופל</th><th style="text-align:right;padding:6px 12px;background:#f0fdfa;border-bottom:2px solid #0d9488;">שעה</th></tr></thead>
                    <tbody>${sessionsHtml}</tbody>
                  </table>
                  <h3 style="margin-top:20px;">משימות פתוחות (${pendingTasks.length})</h3>
                  <ul style="padding-right:20px;">${tasksHtml}</ul>
                  <p style="color:#6b7280;font-size:13px;margin-top:24px;">מייל זה נשלח אוטומטית ממערכת MyTipul</p>
                </div>`,
              }).catch(() => {});
            }
          }

          // Monthly payment collection reminder
          const monthlyReminderDay = (settings as { monthlyReminderDay?: number }).monthlyReminderDay;
          const israelDay = parseInt(israelDateStr.split("-")[2]);
          if (monthlyReminderDay && israelDay === monthlyReminderDay) {
            const allPendingPayments = await prisma.payment.findMany({
              where: {
                client: { therapistId: user.id },
                status: "PENDING",
                parentPaymentId: null,
              },
              include: { client: true },
            });

            if (allPendingPayments.length > 0) {
              const totalAmount = calculateDebtFromPayments(allPendingPayments);

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
      }
    }

    return NextResponse.json({
      message: "Notifications generated",
      usersChecked: users.length,
      count: notificationsCreated,
    });
  } catch (error) {
    console.error("Cron notifications error:", error);
    return NextResponse.json({ message: "Error generating notifications" }, { status: 500 });
  }
}
