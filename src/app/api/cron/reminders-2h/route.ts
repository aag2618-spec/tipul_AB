import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { create2HourReminderEmail, formatSessionDateTime } from "@/lib/email-templates";

// Send 2-hour session reminders
// Should be called by cron job every 15 minutes

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    
    // Find sessions starting in 1.75-2.25 hours (to catch within the 15-minute window)
    const reminderWindowStart = new Date(now.getTime() + 105 * 60 * 1000); // 1h45m
    const reminderWindowEnd = new Date(now.getTime() + 135 * 60 * 1000);   // 2h15m

    const upcomingSessions = await prisma.therapySession.findMany({
      where: {
        startTime: {
          gte: reminderWindowStart,
          lt: reminderWindowEnd,
        },
        status: "SCHEDULED",
      },
      include: {
        client: true,
        therapist: {
          include: {
            communicationSetting: true,
          },
        },
      },
    });

    let emailsSent = 0;
    const errors: string[] = [];

    for (const session of upcomingSessions) {
      // Skip if client has no email
      if (!session.client.email) continue;

      // Check if therapist has 2h reminders enabled
      const settings = session.therapist.communicationSetting;
      if (settings && !settings.send2hReminder) continue;

      // Check if we already sent this reminder
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
        therapistName: session.therapist.name || "המטפל/ת שלך",
        date,
        time,
        address: session.location || undefined,
      });

      const result = await sendEmail({
        to: session.client.email,
        subject,
        html,
        replyTo: session.therapist.email || undefined, // תשובות יגיעו למטפל
      });

      // Log communication
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

    return NextResponse.json({
      message: "2-hour reminders processed",
      sessionsFound: upcomingSessions.length,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Cron 2h reminders error:", error);
    return NextResponse.json(
      { message: "Error processing 2h reminders" },
      { status: 500 }
    );
  }
}
