import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { calculateDebtFromPayments } from "@/lib/payment-utils";
import { escapeHtml } from "@/lib/email-utils";
import { logger } from "@/lib/logger";
import { parseIsraelTime } from "@/lib/date-utils";

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
    // parseIsraelTime handles DST correctly by testing both UTC+2 and UTC+3 offsets
    const today = parseIsraelTime(israelDateStr);
    const tomorrowDateStr = new Date(today.getTime() + 86400000)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    const tomorrow = parseIsraelTime(tomorrowDateStr);
    const dayAfterStr = new Date(tomorrow.getTime() + 86400000)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    const dayAfterTomorrow = parseIsraelTime(dayAfterStr);

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

    // חישוב השעה הנוכחית בישראל (שעות:דקות) לבדיקת שעות מותאמות אישית
    const israelTimeStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    const [currentHour, currentMinute] = israelTimeStr.split(":").map(Number);
    const currentMinutesSinceMidnight = currentHour * 60 + currentMinute;

    let notificationsCreated = 0;

    for (const user of users) {
      // Skip users who explicitly disabled email notifications
      const emailSetting = user.notificationSettings.find((s) => s.channel === "email");
      if (emailSetting && !emailSetting.enabled) continue;

      const settings = user.notificationSettings[0] || { debtThresholdDays: 30 };
      const shouldSendEmail = !!user.email;

      // שעות מותאמות אישית — ברירת מחדל 08:00 ו-20:00
      const userMorningTime = (emailSetting as { morningTime?: string | null })?.morningTime || "08:00";
      const userEveningTime = (emailSetting as { eveningTime?: string | null })?.eveningTime || "20:00";
      const [mHour, mMin] = userMorningTime.split(":").map(Number);
      const [eHour, eMin] = userEveningTime.split(":").map(Number);
      const morningMinutes = mHour * 60 + mMin;
      const eveningMinutes = eHour * 60 + eMin;

      // בדיקה: האם כבר הגיע הזמן? (חלון 0-30 דקות אחרי השעה שהוגדרה)
      const isMorningTime = currentMinutesSinceMidnight >= morningMinutes && currentMinutesSinceMidnight < morningMinutes + 30;
      const isEveningTime = currentMinutesSinceMidnight >= eveningMinutes && currentMinutesSinceMidnight < eveningMinutes + 30;

      // ── Morning summary ──
      if (sendMorning && isMorningTime) {
        // Duplicate prevention: skip if we already created a morning summary today
        const alreadySentMorning = await prisma.notification.findFirst({
          where: { userId: user.id, type: "MORNING_SUMMARY", createdAt: { gte: today } },
        });

        if (!alreadySentMorning) {
          const todaySessions = await prisma.therapySession.findMany({
            where: {
              therapistId: user.id,
              startTime: { gte: today, lt: tomorrow },
              status: { notIn: ["CANCELLED"] },
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

              const mornHtml = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#0d9488;">☀️ ${title}</h2>
                  <p>שלום ${escapeHtml(user.name || "")},</p>
                  <p>יש לך <strong>${realSessions.length} פגישות</strong> היום:</p>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                    <thead><tr><th style="text-align:right;padding:6px 12px;background:#f0fdfa;border-bottom:2px solid #0d9488;">מטופל</th><th style="text-align:right;padding:6px 12px;background:#f0fdfa;border-bottom:2px solid #0d9488;">שעה</th></tr></thead>
                    <tbody>${sessionsHtml}</tbody>
                  </table>
                  <p style="color:#6b7280;font-size:13px;margin-top:24px;">מייל זה נשלח אוטומטית ממערכת MyTipul</p>
                </div>`;
              const mornResult = await sendEmail({ to: user.email!, subject: title, html: mornHtml })
                .catch((err) => { logger.error("שגיאה בשליחת מייל סיכום בוקר", { userId: user.id, error: err instanceof Error ? err.message : String(err) }); return { success: false, error: String(err) }; });
              await prisma.communicationLog.create({
                data: {
                  type: "CUSTOM",
                  channel: "EMAIL",
                  recipient: user.email!.toLowerCase(),
                  subject: title,
                  content: mornHtml,
                  status: mornResult?.success ? "SENT" : "FAILED",
                  errorMessage: mornResult?.success ? null : String(mornResult?.error || "unknown"),
                  sentAt: mornResult?.success ? new Date() : null,
                  userId: user.id,
                },
              }).catch(() => {});
            }
          }

        }
      }

      // ── תזכורת תשלום — עצמאית מסיכום בוקר/ערב ──
      if (sendMorning && isMorningTime) {
        // Duplicate prevention: רק תזכורת תשלום אחת ביום
        const alreadySentPayment = await prisma.notification.findFirst({
          where: { userId: user.id, type: "PAYMENT_REMINDER", createdAt: { gte: today } },
        });

        if (!alreadySentPayment) {
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

            // שליחת מייל תזכורת תשלום למטפל
            if (shouldSendEmail) {
              const clientsList = [...new Set(realPayments.map(p => (p.client as { name: string })?.name).filter(Boolean))];
              const clientsHtml = clientsList
                .map(name => `<li style="margin-bottom:4px;">${escapeHtml(name)}</li>`)
                .join("");

              const payHtml = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#dc2626;">💳 ${escapeHtml(title)}</h2>
                  <p>שלום ${escapeHtml(user.name || "")},</p>
                  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">
                    <p style="margin:0;font-size:18px;font-weight:bold;color:#991b1b;">סה"כ חוב: ₪${totalDebt.toLocaleString()}</p>
                    <p style="margin:8px 0 0 0;color:#7f1d1d;">${realPayments.length} תשלומים ממתינים</p>
                    ${oldPayments.length > 0 ? `<p style="margin:4px 0 0 0;color:#991b1b;font-weight:600;">${oldPayments.length} מהם מעל ${debtThreshold} ימים!</p>` : ""}
                  </div>
                  <h3 style="margin-top:20px;">מטופלים עם חוב:</h3>
                  <ul style="padding-right:20px;">${clientsHtml}</ul>
                  <p style="color:#6b7280;font-size:13px;margin-top:24px;">מייל זה נשלח אוטומטית ממערכת MyTipul</p>
                </div>`;
              const payResult = await sendEmail({ to: user.email!, subject: title, html: payHtml })
                .catch((err) => { logger.error("שגיאה בשליחת מייל תזכורת תשלום", { userId: user.id, error: err instanceof Error ? err.message : String(err) }); return { success: false, error: String(err) }; });
              await prisma.communicationLog.create({
                data: {
                  type: "CUSTOM",
                  channel: "EMAIL",
                  recipient: user.email!.toLowerCase(),
                  subject: title,
                  content: payHtml,
                  status: payResult?.success ? "SENT" : "FAILED",
                  errorMessage: payResult?.success ? null : String(payResult?.error || "unknown"),
                  sentAt: payResult?.success ? new Date() : null,
                  userId: user.id,
                },
              }).catch(() => {});
            }
          }
        }
      }

      // ── Evening summary ──
      if (sendEvening && isEveningTime) {
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

          // פגישות של היום בלי סיכום - רק פגישות שעודכנו כהושלמות
          const sessionsPendingSummary = await prisma.therapySession.findMany({
            where: {
              therapistId: user.id,
              startTime: { gte: today, lt: tomorrow },
              skipSummary: { not: true },
              type: { not: "BREAK" },
              status: "COMPLETED",
              sessionNote: { is: null },
            },
            include: { client: { select: { name: true } } },
            orderBy: { startTime: "asc" },
          });

          // פגישות שהזמן שלהן עבר אבל הסטטוס לא עודכן (לא סומנו כהושלמו/לא הגיע/בוטלו)
          const notUpdatedSessions = await prisma.therapySession.findMany({
            where: {
              therapistId: user.id,
              startTime: { gte: today, lt: tomorrow },
              endTime: { lt: now },
              type: { not: "BREAK" },
              status: "SCHEDULED",
            },
            include: { client: { select: { name: true } } },
            orderBy: { startTime: "asc" },
          });

          // תשלומים ממתינים — אותו query כמו בבוקר
          const eveningPayments = await prisma.payment.findMany({
            where: {
              client: { therapistId: user.id },
              status: "PENDING",
              parentPaymentId: null,
            },
            include: { client: true },
          });
          const unpaidEveningPayments = eveningPayments.filter((p) => {
            const paid = Number(p.amount);
            const expected = Number(p.expectedAmount) || 0;
            return expected > 0 && paid < expected;
          });
          const eveningTotalDebt = unpaidEveningPayments.length > 0 ? calculateDebtFromPayments(unpaidEveningPayments) : 0;

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

          // ניקוי משימות גבייה שכבר לא רלוונטיות - אימות מול טבלת התשלומים
          const collectTasks = pendingTasks.filter(t => t.type === "COLLECT_PAYMENT" && t.relatedEntityId);
          let staleTaskIds: string[] = [];
          if (collectTasks.length > 0) {
            const paymentIds = collectTasks.map(t => t.relatedEntityId!);
            const payments = await prisma.payment.findMany({
              where: { id: { in: paymentIds } },
              select: { id: true, status: true, amount: true, expectedAmount: true },
            });
            const paymentMap = new Map(payments.map(p => [p.id, p]));

            staleTaskIds = collectTasks
              .filter(t => {
                const payment = paymentMap.get(t.relatedEntityId!);
                if (!payment) return true; // תשלום נמחק
                if (payment.status === "PAID") return true; // שולם
                const paid = Number(payment.amount);
                const expected = Number(payment.expectedAmount) || 0;
                if (expected > 0 && paid >= expected) return true; // שולם מלא אבל סטטוס לא עודכן
                return false;
              })
              .map(t => t.id);

            if (staleTaskIds.length > 0) {
              await prisma.task.updateMany({
                where: { id: { in: staleTaskIds } },
                data: { status: "COMPLETED" },
              });
            }
          }

          // ניקוי משימות גבייה עם 0₪
          const zeroDebtTaskIds = pendingTasks
            .filter(t => t.type === "COLLECT_PAYMENT" && /[-–]\s*(₪0|0₪)\s*$/.test(t.title))
            .map(t => t.id);
          if (zeroDebtTaskIds.length > 0) {
            await prisma.task.updateMany({
              where: { id: { in: zeroDebtTaskIds } },
              data: { status: "COMPLETED" },
            });
          }

          // סינון כל המשימות הלא-רלוונטיות מהתצוגה (חוב ששולם + 0₪)
          const allInvalidTaskIds = new Set([...staleTaskIds, ...zeroDebtTaskIds]);
          const filteredTasks = pendingTasks.filter(t => !allInvalidTaskIds.has(t.id));

          const totalPending = sessionsPendingSummary.length + filteredTasks.length + notUpdatedSessions.length;

          if (tomorrowSessions.length > 0 || totalPending > 0 || unpaidEveningPayments.length > 0) {
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
            const notUpdatedList = notUpdatedSessions
              .map((s) => `• עדכן סטטוס - ${s.client?.name || "מטופל"} (${new Date(s.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })})`)
              .join("\n");
            const tasksList = filteredTasks
              .map((t) => `• ${t.title}`)
              .join("\n");
            const allTasksList = [summaryList, notUpdatedList, tasksList].filter(Boolean).join("\n");

            const paymentText = unpaidEveningPayments.length > 0
              ? `\n\nתשלומים ממתינים (${unpaidEveningPayments.length}): סה"כ ₪${eveningTotalDebt.toLocaleString()}`
              : "";

            const title = `סיכום ליום מחר - ${tomorrow.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}`;
            const content = `פגישות מחר (${realTomorrowSessions.length}):\n${sessionsList || "אין פגישות"}\n\nמשימות פתוחות (${totalPending}):\n${allTasksList || "אין משימות"}${paymentText}`;

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
              const notUpdatedItemsHtml = notUpdatedSessions
                .map((s) => `<li style="margin-bottom:4px;">עדכן סטטוס - ${escapeHtml(s.client?.name || "מטופל")} (${new Date(s.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })})</li>`)
                .join("");
              const taskItemsHtml = filteredTasks
                .map((t) => `<li style="margin-bottom:4px;">${escapeHtml(t.title)}</li>`)
                .join("");
              const allTasksHtml = summaryItemsHtml + notUpdatedItemsHtml + taskItemsHtml || `<li style="color:#6b7280;">אין משימות פתוחות</li>`;

              // בניית סעיף פגישות שלא עודכנו
              const notUpdatedHtml = notUpdatedSessions.length > 0
                ? `<h3 style="margin-top:20px;color:#d97706;">⚠️ פגישות שטרם עודכנו (${notUpdatedSessions.length})</h3>
                  <ul style="padding-right:20px;">${notUpdatedItemsHtml}</ul>`
                : "";

              // בניית סעיף תשלומים ממתינים
              const eveningClientsList = [...new Set(unpaidEveningPayments.map(p => (p.client as { name: string })?.name).filter(Boolean))];
              const eveningPaymentHtml = unpaidEveningPayments.length > 0
                ? `<h3 style="margin-top:20px;color:#dc2626;">💳 תשלומים ממתינים (${unpaidEveningPayments.length})</h3>
                  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin:8px 0;">
                    <p style="margin:0;font-weight:bold;color:#991b1b;">סה"כ חוב: ₪${eveningTotalDebt.toLocaleString()}</p>
                    <ul style="padding-right:20px;margin:8px 0 0 0;">${eveningClientsList.map(name => `<li style="margin-bottom:4px;">${escapeHtml(name)}</li>`).join("")}</ul>
                  </div>`
                : "";

              const eveHtml = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#0d9488;">🌙 ${title}</h2>
                  <p>שלום ${escapeHtml(user.name || "")},</p>
                  <h3 style="margin-top:20px;">פגישות מחר (${realTomorrowSessions.length})</h3>
                  <table style="width:100%;border-collapse:collapse;margin:12px 0;">
                    <thead><tr><th style="text-align:right;padding:6px 12px;background:#f0fdfa;border-bottom:2px solid #0d9488;">מטופל</th><th style="text-align:right;padding:6px 12px;background:#f0fdfa;border-bottom:2px solid #0d9488;">שעה</th></tr></thead>
                    <tbody>${sessionsHtml}</tbody>
                  </table>
                  ${notUpdatedHtml}
                  <h3 style="margin-top:20px;">משימות פתוחות (${sessionsPendingSummary.length + filteredTasks.length})</h3>
                  <ul style="padding-right:20px;">${summaryItemsHtml + taskItemsHtml || `<li style="color:#6b7280;">אין משימות פתוחות</li>`}</ul>
                  ${eveningPaymentHtml}
                  <p style="color:#6b7280;font-size:13px;margin-top:24px;">מייל זה נשלח אוטומטית ממערכת MyTipul</p>
                </div>`;
              const eveResult = await sendEmail({ to: user.email!, subject: title, html: eveHtml })
                .catch((err) => { logger.error("שגיאה בשליחת מייל סיכום ערב", { userId: user.id, error: err instanceof Error ? err.message : String(err) }); return { success: false, error: String(err) }; });
              await prisma.communicationLog.create({
                data: {
                  type: "CUSTOM",
                  channel: "EMAIL",
                  recipient: user.email!.toLowerCase(),
                  subject: title,
                  content: eveHtml,
                  status: eveResult?.success ? "SENT" : "FAILED",
                  errorMessage: eveResult?.success ? null : String(eveResult?.error || "unknown"),
                  sentAt: eveResult?.success ? new Date() : null,
                  userId: user.id,
                },
              }).catch(() => {});
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
