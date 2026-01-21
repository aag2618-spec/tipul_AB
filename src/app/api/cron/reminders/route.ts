import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail, createSessionReminderEmail } from "@/lib/resend";

// Send 48-hour session reminders
// Should be called by cron job every hour

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    
    // Find sessions starting in 47-49 hours (to catch within the hour window)
    const reminderWindowStart = new Date(now.getTime() + 47 * 60 * 60 * 1000);
    const reminderWindowEnd = new Date(now.getTime() + 49 * 60 * 60 * 1000);

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
        therapist: true,
      },
    });

    let emailsSent = 0;
    const errors: string[] = [];

    for (const session of upcomingSessions) {
      // Skip if client has no email
      if (!session.client.email) continue;

      const { subject, html } = createSessionReminderEmail(
        session.client.name,
        session.therapist.name || "המטפל/ת שלך",
        session.startTime,
        session.type
      );

      const result = await sendEmail({
        to: session.client.email,
        subject,
        html,
        replyTo: session.therapist.email || undefined, // תשובות יגיעו למטפל
      });

      if (result.success) {
        emailsSent++;
        
        // Create notification record for therapist
        await prisma.notification.create({
          data: {
            userId: session.therapistId,
            type: "SESSION_REMINDER",
            title: `תזכורת נשלחה ל${session.client.name}`,
            content: `תזכורת לפגישה ב-${session.startTime.toLocaleDateString("he-IL")} נשלחה בהצלחה`,
            status: "SENT",
            sentAt: new Date(),
          },
        });
      } else {
        errors.push(`Failed to send to ${session.client.email}: ${result.error}`);
      }
    }

    return NextResponse.json({
      message: "Reminders processed",
      sessionsFound: upcomingSessions.length,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Cron reminders error:", error);
    return NextResponse.json(
      { message: "Error processing reminders" },
      { status: 500 }
    );
  }
}







