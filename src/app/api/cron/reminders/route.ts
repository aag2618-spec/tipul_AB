import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { create24HourReminderEmail, formatSessionDateTime } from "@/lib/email-templates";
import { sendSMSIfEnabled } from "@/lib/sms";
import { logger } from "@/lib/logger";
import { isShabbatOrYomTov, wasShabbatInLastHours } from "@/lib/shabbat";

// Send 24-hour session reminders
// Should be called by cron job every hour

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ message: "CRON_SECRET not configured" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Shabbat/Yom Tov — דלג לגמרי; catch-up יתבצע במוצאי שבת
  if (isShabbatOrYomTov()) {
    logger.info("[cron reminders-24h] דילוג בשבת/חג");
    return NextResponse.json({ skipped: true, reason: "shabbat_or_yomtov" });
  }

  try {
    const now = new Date();
    // אם שבת הסתיימה ב-72h האחרונים — מרחיבים את חלון השאילתה אחורה
    // כדי לתפוס פגישות שהתזכורת שלהן הוחמצה בשבת.
    const needsCatchup = wasShabbatInLastHours(now, 72);

    // Find sessions starting in 23-25 hours (to catch within the hour window).
    // בזמן catch-up (אחרי שבת): מרחיבים מ-"now" עד +25h כדי לתפוס כל פגישה עתידית
    // שהתזכורת שלה הוחמצה. dedup של status:SENT מונע שליחה כפולה.
    const reminderWindowStart = needsCatchup
      ? now
      : new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const reminderWindowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

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
    let smsSent = 0;
    const errors: string[] = [];

    for (const session of upcomingSessions) {
      // Skip if client is null (BREAK session) or has no email
      if (!session.client || !session.client.email) continue;

      // Check if therapist has 24h reminders enabled
      const settings = session.therapist.communicationSetting;
      if (settings && !settings.send24hReminder) continue;

      // ⭐ סינון SENT + EMAIL בלבד — log של FAILED לא חוסם retry (למשל אחרי שבת),
      //    ו-SMS שנשלח בהצלחה לא חוסם retry של EMAIL (זה dedup נפרד לכל ערוץ)
      const existingLog = await prisma.communicationLog.findFirst({
        where: {
          sessionId: session.id,
          type: "REMINDER_24H",
          channel: "EMAIL",
          status: "SENT",
        },
      });

      if (existingLog) continue;

      const { date, time } = formatSessionDateTime(session.startTime);
      const { subject, html } = create24HourReminderEmail({
        clientName: session.client.name,
        therapistName: session.therapist.name || "המטפל/ת שלך",
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

      // Log communication
      await prisma.communicationLog.create({
        data: {
          type: "REMINDER_24H",
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
      const dayName = session.startTime.toLocaleDateString("he-IL", { weekday: "long", timeZone: "Asia/Jerusalem" });
      const smsResult = await sendSMSIfEnabled({
        userId: session.therapistId,
        phone: session.client.phone,
        template: settings?.templateReminder24hSMS,
        defaultTemplate: "שלום {שם}, תזכורת לפגישה מחר ({יום}) ב-{שעה}",
        placeholders: {
          שם: session.client.firstName || session.client.name,
          תאריך: date,
          שעה: time,
          יום: dayName,
        },
        settingKey: "sendReminder24hSMS",
        sessionId: session.id,
        clientId: session.clientId || undefined,
        type: "REMINDER_24H",
      });
      if (smsResult.success) smsSent++;
    }

    return NextResponse.json({
      message: "24-hour reminders processed",
      sessionsFound: upcomingSessions.length,
      emailsSent,
      smsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error("Cron 24h reminders error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Error processing 24h reminders" },
      { status: 500 }
    );
  }
}







