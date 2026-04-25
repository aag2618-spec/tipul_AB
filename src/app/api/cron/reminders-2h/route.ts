import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { create2HourReminderEmail, formatSessionDateTime } from "@/lib/email-templates";
import { sendSMSIfEnabled } from "@/lib/sms";
import { logger } from "@/lib/logger";
import { isShabbatOrYomTov, wasShabbatInLastHours } from "@/lib/shabbat";
import { checkCronAuth } from "@/lib/cron-auth";

// Send custom-timed session reminders (replaces fixed 2h reminders)
// Should be called by cron job every 15 minutes

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await checkCronAuth(request);
  if (guard) return guard;

  // Shabbat/Yom Tov — דלג לגמרי; catch-up יתבצע במוצאי שבת
  if (isShabbatOrYomTov()) {
    logger.info("[cron reminders-2h] דילוג בשבת/חג");
    return NextResponse.json({ skipped: true, reason: "shabbat_or_yomtov" });
  }

  try {
    const now = new Date();
    // אם שבת הסתיימה ב-72h האחרונים — הרחב את החלון אחורה כדי לתפוס פגישות שהוחמצו
    const needsCatchup = wasShabbatInLastHours(now, 72);

    const therapistsWithCustomReminders = await prisma.user.findMany({
      where: {
        communicationSetting: {
          OR: [
            { customReminderEnabled: true },
            { send2hReminder: true },
          ],
        },
      },
      include: {
        communicationSetting: true,
      },
    });

    let emailsSent = 0;
    let smsSent = 0;
    const errors: string[] = [];

    for (const therapist of therapistsWithCustomReminders) {
      const settings = therapist.communicationSetting;
      if (!settings) continue;

      const reminderHours = settings.customReminderEnabled
        ? settings.customReminderHours
        : 2;

      const windowMinutes = 20; // מעט יותר מ-15 דקות כדי למנוע פספוס בגלל drift
      const reminderMs = reminderHours * 60 * 60 * 1000;
      const halfWindow = (windowMinutes / 2) * 60 * 1000;
      // catch-up (אחרי שבת): מרחיבים החל מ"עכשיו" עד חלון התזכורת הרגיל,
      //   כדי לתפוס פגישות עתידיות שהתזכורת שלהן הוחמצה. dedup של SENT מונע כפילות.
      const reminderWindowStart = needsCatchup
        ? now
        : new Date(now.getTime() + reminderMs - halfWindow);
      const reminderWindowEnd = new Date(now.getTime() + reminderMs + halfWindow);

      const upcomingSessions = await prisma.therapySession.findMany({
        where: {
          therapistId: therapist.id,
          startTime: {
            gte: reminderWindowStart,
            lt: reminderWindowEnd,
          },
          status: "SCHEDULED",
        },
        include: {
          client: true,
        },
      });

      for (const session of upcomingSessions) {
        if (!session.client || !session.client.email) continue;

        // ⭐ סינון SENT + EMAIL בלבד — log של FAILED לא חוסם retry (למשל אחרי שבת),
        //    ו-SMS שנשלח בהצלחה לא חוסם retry של EMAIL (dedup נפרד לכל ערוץ)
        const existingLog = await prisma.communicationLog.findFirst({
          where: {
            sessionId: session.id,
            type: "REMINDER_2H",
            channel: "EMAIL",
            status: "SENT",
          },
        });

        if (existingLog) continue;

        const { date, time } = formatSessionDateTime(session.startTime);
        const { subject, html } = create2HourReminderEmail({
          clientName: session.client.name,
          therapistName: therapist.name || "המטפל/ת שלך",
          date,
          time,
          address: session.location || undefined,
          customization: settings ? {
            customGreeting: settings.customGreeting,
            customClosing: settings.customClosing,
            emailSignature: settings.emailSignature,
            businessHours: settings.businessHours,
          } : null,
        });

        const result = await sendEmail({
          to: session.client.email,
          subject,
          html,
        });

        await prisma.communicationLog.create({
          data: {
            type: "REMINDER_2H",
            channel: "EMAIL",
            recipient: session.client.email,
            subject,
            content: html,
            status: result.success ? "SENT" : "FAILED",
            errorMessage: result.success ? null : String(result.error),
            sentAt: result.success ? new Date() : null,
            messageId: result.messageId || null,
            sessionId: session.id,
            clientId: session.clientId,
            userId: session.therapistId,
          },
        });

        if (result.success) {
          emailsSent++;
        } else {
          errors.push(`Failed to send to ${session.client.email}: ${result.error}`);
        }

        // Send SMS reminder (independent from email)
        const smsResult = await sendSMSIfEnabled({
          userId: session.therapistId,
          phone: session.client.phone,
          template: settings?.templateReminderCustomSMS,
          defaultTemplate: "שלום {שם}, פגישה בעוד {שעות} שעות ב-{שעה}",
          placeholders: {
            שם: session.client.firstName || session.client.name,
            תאריך: date,
            שעה: time,
            שעות: String(reminderHours),
          },
          settingKey: "sendReminderCustomSMS",
          sessionId: session.id,
          clientId: session.clientId || undefined,
          type: "REMINDER_2H",
        });
        if (smsResult.success) smsSent++;
      }
    }

    return NextResponse.json({
      message: "Custom reminders processed",
      therapistsChecked: therapistsWithCustomReminders.length,
      emailsSent,
      smsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error("Cron custom reminders error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Error processing custom reminders" },
      { status: 500 }
    );
  }
}
