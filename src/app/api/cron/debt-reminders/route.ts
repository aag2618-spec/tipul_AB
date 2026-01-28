import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { format } from "date-fns";
import { he } from "date-fns/locale";

// Helper function to create debt reminder email
function createDebtReminderEmail(
  clientName: string,
  therapistName: string,
  sessions: Array<{
    date: Date;
    type: string;
    status: string;
    debt: number;
  }>,
  totalDebt: number
) {
  const sessionsHtml = sessions
    .map((session) => {
      const dateStr = format(new Date(session.date), "EEEE, d בMMMM yyyy • HH:mm", {
        locale: he,
      });
      
      const typeLabel =
        session.type === "ONLINE"
          ? "אונליין"
          : session.type === "PHONE"
          ? "טלפון"
          : "פרונטלי";

      let statusLabel = "";
      let statusColor = "";
      if (session.status === "COMPLETED") {
        statusLabel = "✅ הפגישה התקיימה";
        statusColor = "#16a34a";
      } else if (session.status === "CANCELLED") {
        statusLabel = "🚫 בוטלה - חויב בכל זאת";
        statusColor = "#dc2626";
      } else if (session.status === "NO_SHOW") {
        statusLabel = "❌ לא הגעת - חויב בכל זאת";
        statusColor = "#dc2626";
      }

      return `
        <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <div style="flex: 1;">
              <p style="margin: 0; font-weight: 600; color: #111827; font-size: 15px;">${dateStr}</p>
              <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 13px;">סוג: ${typeLabel}</p>
            </div>
            <div style="text-align: left;">
              <p style="margin: 0; font-weight: 700; color: #dc2626; font-size: 18px;">₪${session.debt}</p>
            </div>
          </div>
          <div style="padding: 8px 12px; background: ${statusColor}10; border-radius: 6px; margin-top: 8px;">
            <p style="margin: 0; color: ${statusColor}; font-size: 13px; font-weight: 500;">${statusLabel}</p>
          </div>
        </div>
      `;
    })
    .join("");

  return {
    subject: `תזכורת תשלום - חוב של ₪${totalDebt}`,
    html: `
      <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; background: #f9fafb;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px 20px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700;">תזכורת תשלום</h1>
        </div>
        
        <!-- Content -->
        <div style="background: #ffffff; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h2 style="color: #111827; margin-top: 0; font-size: 20px;">שלום ${clientName},</h2>
          
          <p style="color: #4b5563; line-height: 1.6; font-size: 15px;">
            רצינו להזכיר לך כי קיים יתרת חוב עבור הפגישות הבאות:
          </p>

          <!-- Total Debt Summary -->
          <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border: 2px solid #dc2626; border-radius: 10px; padding: 20px; margin: 25px 0; text-align: center;">
            <p style="margin: 0; color: #7f1d1d; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">סה"כ חוב</p>
            <p style="margin: 8px 0 0 0; color: #991b1b; font-size: 36px; font-weight: 800;">₪${totalDebt}</p>
          </div>

          <!-- Sessions List -->
          <h3 style="color: #111827; font-size: 17px; margin: 30px 0 15px 0; font-weight: 600;">פירוט פגישות:</h3>
          
          ${sessionsHtml}

          <!-- Payment Info -->
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 20px; margin-top: 30px;">
            <p style="margin: 0; color: #166534; font-weight: 600; font-size: 15px;">💳 אפשרויות תשלום</p>
            <p style="margin: 8px 0 0 0; color: #15803d; font-size: 14px; line-height: 1.6;">
              ניתן לשלם באמצעות העברה בנקאית, אשראי, מזומן או צ'ק.<br/>
              לתיאום תשלום, נא ליצור קשר.
            </p>
          </div>

          <!-- Note -->
          <div style="margin-top: 25px; padding: 15px; background: #fef3c7; border-right: 4px solid #f59e0b; border-radius: 6px;">
            <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
              <strong>💡 שים לב:</strong> פגישות שבוטלו או שלא הגעת אליהן עדיין מחויבות בהתאם למדיניות הביטול.
            </p>
          </div>

          <!-- Footer -->
          <div style="margin-top: 35px; padding-top: 25px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0;">
              במידה ויש שאלות או צורך לתיאום תשלום, אנא פנה אליי ישירות.
            </p>
            <p style="color: #374151; font-size: 15px; margin: 20px 0 0 0;">
              בברכה,<br/>
              <strong>${therapistName}</strong>
            </p>
          </div>
        </div>
        
        <!-- Footer Note -->
        <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">מייל זה נשלח אוטומטית ממערכת הניהול שלנו</p>
        </div>
      </div>
    `,
  };
}

/**
 * Cron job for sending monthly debt reminders
 * Should be called daily (Render cron: 0 9 * * *)
 * Checks if today is the configured day of month and sends reminders
 */
export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date();
    const dayOfMonth = today.getDate();

    console.log(`[Debt Reminders Cron] Running for day ${dayOfMonth} of month`);

    // Get all users with debt reminders enabled for today
    const usersWithReminders = await prisma.communicationSetting.findMany({
      where: {
        sendDebtReminders: true,
        debtReminderDayOfMonth: dayOfMonth,
      },
      include: {
        user: true,
      },
    });

    console.log(`[Debt Reminders Cron] Found ${usersWithReminders.length} therapists with reminders enabled`);

    let totalEmailsSent = 0;
    let totalClientsProcessed = 0;
    const errors: string[] = [];

    // Process each therapist
    for (const setting of usersWithReminders) {
      const therapist = setting.user;
      const minAmount = Number(setting.debtReminderMinAmount);

      console.log(`[Debt Reminders Cron] Processing therapist ${therapist.name} (min amount: ₪${minAmount})`);

      // Get all clients with unpaid sessions for this therapist
      const clients = await prisma.client.findMany({
        where: {
          therapistId: therapist.id,
          email: { not: null },
        },
        include: {
          therapySessions: {
            where: {
              status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW"] },
              type: { not: "BREAK" },
              OR: [
                { payment: null },
                {
                  payment: {
                    status: "PENDING",
                  },
                },
              ],
            },
            include: {
              payment: true,
            },
            orderBy: {
              startTime: "asc",
            },
          },
        },
      });

      // Filter clients with debt above minimum
      for (const client of clients) {
        if (!client.email) continue;

        const sessionsWithDebt = client.therapySessions.map((session) => {
          const sessionPrice = Number(session.price);
          const alreadyPaid = session.payment ? Number(session.payment.amount) : 0;
          const debt = sessionPrice - alreadyPaid;

          return {
            date: session.startTime,
            type: session.type,
            status: session.status,
            debt,
          };
        });

        const totalDebt = sessionsWithDebt.reduce((sum, s) => sum + s.debt, 0);

        // Skip if debt is below minimum
        if (totalDebt < minAmount) {
          console.log(`[Debt Reminders Cron] Skipping ${client.name} - debt ₪${totalDebt} below minimum ₪${minAmount}`);
          continue;
        }

        console.log(`[Debt Reminders Cron] Sending to ${client.name} - debt ₪${totalDebt}`);
        totalClientsProcessed++;

        // Create email
        const { subject, html } = createDebtReminderEmail(
          client.name,
          therapist.name || "המטפל/ת שלך",
          sessionsWithDebt,
          totalDebt
        );

        // Send email
        const result = await sendEmail({
          to: client.email,
          subject,
          html,
          replyTo: therapist.email || undefined,
        });

        if (result.success) {
          totalEmailsSent++;

          // Log communication
          await prisma.communicationLog.create({
            data: {
              type: "CUSTOM",
              channel: "EMAIL",
              recipient: client.email.toLowerCase(),
              subject,
              content: html,
              status: "SENT",
              sentAt: new Date(),
            },
          });

          // Create notification for therapist
          await prisma.notification.create({
            data: {
              userId: therapist.id,
              type: "PAYMENT_REMINDER",
              title: `תזכורת חוב נשלחה ל-${client.name}`,
              content: `תזכורת תשלום עבור חוב של ₪${totalDebt} נשלחה בהצלחה`,
              status: "SENT",
              sentAt: new Date(),
            },
          });
        } else {
          errors.push(`Failed to send to ${client.name} (${client.email}): ${result.error}`);
          console.error(`[Debt Reminders Cron] Error sending to ${client.name}:`, result.error);
        }
      }
    }

    const response = {
      message: "Debt reminders processed",
      dayOfMonth,
      therapistsProcessed: usersWithReminders.length,
      clientsProcessed: totalClientsProcessed,
      emailsSent: totalEmailsSent,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log(`[Debt Reminders Cron] Completed:`, response);

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Debt Reminders Cron] Error:", error);
    return NextResponse.json(
      {
        message: "Error processing debt reminders",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
