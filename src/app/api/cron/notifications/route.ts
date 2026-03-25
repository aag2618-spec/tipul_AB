import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { calculateDebtFromPayments } from "@/lib/payment-utils";
import { escapeHtml } from "@/lib/email-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ message: "CRON_SECRET not configured" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
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

    // Include active therapists with notifications enabled OR users who never configured settings (default = on)
    const users = await prisma.user.findMany({
      where: {
        email: { not: null },
        isBlocked: { not: true },
        clients: { some: {} }, // Only users who have clients (i.e. therapists)
        OR: [
          { notificationSettings: { some: { enabled: true } } },
          { notificationSettings: { none: {} } },
        ],
      },
      include: {
        notificationSettings: true,
      },
    });

    // פקיעת תזכורות ישנות - סיכומי בוקר/ערב שנוצרו לפני יותר מיום ועדיין לא נקראו
    await prisma.notification.updateMany({
      where: {
        type: { in: ["MORNING_SUMMARY", "EVENING_SUMMARY"] },
        status: { in: ["PENDING", "SENT"] },
        createdAt: { lt: today },
      },
      data: { status: "DISMISSED" },
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
                  <p>שלום ${escapeHtml(user.name || "")},</p>
                  <p>יש לך <strong>${realSessions.length} פגישות</strong> היום:</p>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                    <thead><tr><th style="text-align:right;padding:6px 12px;background:#f0fdfa;border-bottom:2px solid #0d9488;">מטופל</th><th style="text-align:right;padding:6px 12px;background:#f0fdfa;border-bottom:2px solid #0d9488;">שעה</th></tr></thead>
                    <tbody>${sessionsHtml}</tbody>
                  </table>
                  <p style="color:#6b7280;font-size:13px;margin-top:24px;">מייל זה נשלח אוטומטית ממערכת MyTipul</p>
                </div>`,
              }).catch((err) => logger.error("שגיאה בשליחת מייל תזכורת", { userId: user.id, error: err instanceof Error ? err.message : String(err) }));
            }
          }

          // תזכורת תשלום מאוחדת - כל התשלומים הממתינים + סימון ישנים
          const debtThreshold = (settings as { debtThresholdDays?: number }).debtThresholdDays || 30;
          const thresholdDate = new Date(today);
          thresholdDate.setDate(thresholdDate.getDate() - debtThreshold);
          const monthlyReminderDay = (settings as { monthlyReminderDay?: number }).monthlyReminderDay;
          const israelDay = parseInt(israelDateStr.split("-")[2]);
          const isMonthlyReminderDay = monthlyReminderDay && israelDay === monthlyReminderDay;

          const allPayments = await prisma.payment.findMany({
            where: {
              client: { therapistId: user.id },
              status: "PENDING",
              parentPaymentId: null,
            },
            include: { client: true },
          });

          const realPayments = allPayments.filter((p) => {
            const paid = Number(p.amount);
            const expected = Number(p.expectedAmount) || 0;
            return expected > 0 && paid < expected;
          });

          if (realPayments.length > 0) {
            const totalDebt = calculateDebtFromPayments(realPayments);
            const oldPayments = realPayments.filter((p) => new Date(p.createdAt) < thresholdDate);

            let title = `תזכורת: ${realPayments.length} תשלומים ממתינים`;
            let content = `יש לך ${realPayments.length} תשלומים ממתינים בסך ₪${totalDebt.toLocaleString()}`;

            if (oldPayments.length > 0) {
              content += `\n${oldPayments.length} מהם ממתינים מעל ${debtThreshold} ימים`;
            }
            if (isMonthlyReminderDay) {
              title = `תזכורת גבייה חודשית`;
              content = `היום יום גבייה! ${content}`;
            }

            await prisma.notification.create({
              data: {
                userId: user.id,
                type: "PAYMENT_REMINDER",
                title,
                content,
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

          // פגישות של היום בלי סיכום - רק היום, לא 30 יום אחורה
          const sessionsPendingSummary = await prisma.therapySession.findMany({
            where: {
              therapistId: user.id,
              startTime: { gte: today, lt: tomorrow },
              skipSummary: { not: true },
              type: { not: "BREAK" },
              status: { in: ["SCHEDULED", "COMPLETED"] },
              sessionNote: { is: null },
            },
            include: { client: { select: { name: true } } },
            orderBy: { startTime: "asc" },
          });

          // מטלות אישיות ותשלומים (לא WRITE_SUMMARY - כבר מכוסה למעלה)
          const pendingTasks = await prisma.task.findMany({
            where: {
              userId: user.id,
              status: { in: ["PENDING", "IN_PROGRESS"] },
              type: { notIn: ["WRITE_SUMMARY"] },
            },
            orderBy: { priority: "desc" },
            take: 5,
          });

          // ניקוי משימות גבייה עם 0₪ - לא רלוונטיות, נסמן כהושלמו
          const zeroDebtTaskIds = pendingTasks
            .filter(t => t.type === "COLLECT_PAYMENT" && /[-–]\s*(₪0|0₪)\s*$/.test(t.title))
            .map(t => t.id);
          if (zeroDebtTaskIds.length > 0) {
            await prisma.task.updateMany({
              where: { id: { in: zeroDebtTaskIds } },
              data: { status: "COMPLETED" },
            });
          }

          // סינון משימות 0₪ מהתצוגה
          const filteredTasks = pendingTasks.filter(t =>
            !(t.type === "COLLECT_PAYMENT" && /[-–]\s*(₪0|0₪)\s*$/.test(t.title))
          );

          const totalPending = sessionsPendingSummary.length + filteredTasks.length;

          if (tomorrowSessions.length > 0 || totalPending > 0) {
            const realTomorrowSessions = tomorrowSessions.filter((s) => s.client);
            const sessionsList = realTomorrowSessions
              .map(
                (s) =>
                  `• ${s.client!.name} - ${new Date(s.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}`
              )
              .join("\n");

            const summaryList = sessionsPendingSummary
              .map((s) => `• כתוב סיכום - ${s.client?.name || "מטופל"}`)
              .join("\n");
            const tasksList = filteredTasks
              .map((t) => `• ${t.title}`)
              .join("\n");
            const allTasksList = [summaryList, tasksList].filter(Boolean).join("\n");

            const title = `סיכום ליום מחר - ${tomorrow.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}`;
            const content = `פגישות מחר (${realTomorrowSessions.length}):\n${sessionsList || "אין פגישות"}\n\nמשימות פתוחות (${totalPending}):\n${allTasksList || "אין משימות"}`;

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
              const summaryItemsHtml = sessionsPendingSummary
                .map((s) => `<li style="margin-bottom:4px;">כתוב סיכום - ${escapeHtml(s.client?.name || "מטופל")}</li>`)
                .join("");
              const taskItemsHtml = filteredTasks
                .map((t) => `<li style="margin-bottom:4px;">${escapeHtml(t.title)}</li>`)
                .join("");
              const allTasksHtml = summaryItemsHtml + taskItemsHtml || `<li style="color:#6b7280;">אין משימות פתוחות</li>`;

              await sendEmail({
                to: user.email!,
                subject: title,
                html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#0d9488;">🌙 ${title}</h2>
                  <p>שלום ${escapeHtml(user.name || "")},</p>
                  <h3 style="margin-top:20px;">פגישות מחר (${realTomorrowSessions.length})</h3>
                  <table style="width:100%;border-collapse:collapse;margin:12px 0;">
                    <thead><tr><th style="text-align:right;padding:6px 12px;background:#f0fdfa;border-bottom:2px solid #0d9488;">מטופל</th><th style="text-align:right;padding:6px 12px;background:#f0fdfa;border-bottom:2px solid #0d9488;">שעה</th></tr></thead>
                    <tbody>${sessionsHtml}</tbody>
                  </table>
                  <h3 style="margin-top:20px;">משימות פתוחות (${totalPending})</h3>
                  <ul style="padding-right:20px;">${allTasksHtml}</ul>
                  <p style="color:#6b7280;font-size:13px;margin-top:24px;">מייל זה נשלח אוטומטית ממערכת MyTipul</p>
                </div>`,
              }).catch((err) => logger.error("שגיאה בשליחת מייל תזכורת", { userId: user.id, error: err instanceof Error ? err.message : String(err) }));
            }
          }

          // תזכורת גבייה חודשית - כבר ממוזגת בבלוק התשלום למעלה
        }
      }
    }

    return NextResponse.json({
      message: "Notifications generated",
      usersChecked: users.length,
      count: notificationsCreated,
    });
  } catch (error) {
    logger.error("Cron notifications error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ message: "Error generating notifications" }, { status: 500 });
  }
}
