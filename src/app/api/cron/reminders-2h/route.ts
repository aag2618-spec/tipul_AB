import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { create2HourReminderEmail, formatSessionDateTime } from "@/lib/email-templates";

// Send custom-timed session reminders (replaces fixed 2h reminders)
// Should be called by cron job every 15 minutes

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

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
    const errors: string[] = [];

    for (const therapist of therapistsWithCustomReminders) {
      const settings = therapist.communicationSetting;
      if (!settings) continue;

      const reminderHours = settings.customReminderEnabled
        ? settings.customReminderHours
        : 2;

      const windowMinutes = 15;
      const reminderMs = reminderHours * 60 * 60 * 1000;
      const halfWindow = (windowMinutes / 2) * 60 * 1000;
      const reminderWindowStart = new Date(now.getTime() + reminderMs - halfWindow);
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

        const existingLog = await prisma.communicationLog.findFirst({
          where: {
            sessionId: session.id,
            type: "REMINDER_2H",
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
        });

        const result = await sendEmail({
          to: session.client.email,
          subject,
          html,
          replyTo: therapist.email || undefined,
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
      }
    }

    return NextResponse.json({
      message: "Custom reminders processed",
      therapistsChecked: therapistsWithCustomReminders.length,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Cron custom reminders error:", error);
    return NextResponse.json(
      { message: "Error processing custom reminders" },
      { status: 500 }
    );
  }
}
