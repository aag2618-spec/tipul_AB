import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { calculateSessionDebt } from "@/lib/payment-utils";
import { escapeHtml } from "@/lib/email-utils";
import { sendSMSIfEnabled } from "@/lib/sms";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function createDebtReminderEmail(
  clientName: string,
  therapistName: string,
  sessions: Array<{
    date: Date;
    type: string;
    status: string;
    debt: number;
  }>,
  totalDebt: number,
  customization?: {
    paymentInstructions?: string | null;
    paymentLink?: string | null;
    emailSignature?: string | null;
    customGreeting?: string | null;
    customClosing?: string | null;
    businessHours?: string | null;
  }
) {
  const greeting = customization?.customGreeting
    ? escapeHtml(customization.customGreeting.replace(/{שם}/g, clientName))
    : `שלום ${escapeHtml(clientName)}`;

  const closing = escapeHtml(customization?.customClosing || "בברכה");
  const signature = escapeHtml(customization?.emailSignature || therapistName);
  const dateFormatter = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const sessionsHtml = sessions
    .map((session) => {
      const dateStr = dateFormatter.format(new Date(session.date));
      
      const typeLabel =
        session.type === "ONLINE"
          ? "אונליין"
          : session.type === "PHONE"
          ? "טלפון"
          : "פרונטלי";

      // סטטוס מפורט
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
          <h2 style="color: #111827; margin-top: 0; font-size: 20px;">${greeting},</h2>
          
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

          ${
            customization?.paymentLink
              ? `
          <!-- Payment Link -->
          <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 12px 0; color: #075985; font-weight: 600; font-size: 15px;">💳 תשלום מהיר</p>
            <a href="${customization.paymentLink}" style="display: inline-block; background: #0ea5e9; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
              שלם עכשיו בקליק
            </a>
            <p style="margin: 12px 0 0 0; color: #0369a1; font-size: 12px;">או השתמש באחת מהאפשרויות למטה</p>
          </div>
          `
              : ""
          }

          <!-- Payment Info -->
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 20px; margin-top: 30px;">
            <p style="margin: 0; color: #166534; font-weight: 600; font-size: 15px;">💳 אפשרויות תשלום</p>
            <p style="margin: 8px 0 0 0; color: #15803d; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
              ${
                customization?.paymentInstructions
                  ? escapeHtml(customization.paymentInstructions)
                  : "ניתן לשלם באמצעות העברה בנקאית, אשראי, מזומן או צ'ק.\nלתיאום תשלום, נא ליצור קשר."
              }
            </p>
          </div>

          ${
            customization?.businessHours
              ? `
          <!-- Business Hours -->
          <div style="background: #fef3c7; border-right: 4px solid #f59e0b; border-radius: 6px; padding: 15px; margin-top: 15px;">
            <p style="margin: 0 0 4px 0; color: #92400e; font-weight: 600; font-size: 13px;">⏰ שעות פעילות</p>
            <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(customization.businessHours)}</p>
          </div>
          `
              : ""
          }

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
            <p style="color: #374151; font-size: 15px; margin: 20px 0 0 0; white-space: pre-wrap;">
              ${closing},<br/>
              <strong>${signature}</strong>
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id: clientId } = await params;

    // Get client
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        therapistId: userId,
      },
    });

    if (!client) {
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

    if (!client.email) {
      return NextResponse.json(
        { message: "למטופל אין כתובת מייל" },
        { status: 400 }
      );
    }

    // Get therapist
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    // Get unpaid/partially paid sessions
    const sessions = await prisma.therapySession.findMany({
      where: {
        clientId: clientId,
        status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW"] },
        type: { not: "BREAK" },
        payment: {
          status: "PENDING",
        },
      },
      include: {
        payment: true,
      },
      orderBy: {
        startTime: "asc",
      },
    });

    if (sessions.length === 0) {
      return NextResponse.json(
        { error: "אין פגישות ממתינות לתשלום" },
        { status: 400 }
      );
    }

    const sessionsWithDebt = sessions
      .map((session) => ({
        date: session.startTime,
        type: session.type,
        status: session.status,
        debt: calculateSessionDebt(session),
      }))
      .filter((s) => s.debt > 0);

    if (sessionsWithDebt.length === 0) {
      return NextResponse.json(
        { error: "אין פגישות עם חוב פתוח" },
        { status: 400 }
      );
    }

    const totalDebt = sessionsWithDebt.reduce((sum, s) => sum + s.debt, 0);

    // Get communication settings for customization
    const commSettings = await prisma.communicationSetting.findUnique({
      where: { userId: userId },
    });

    // Create email
    const { subject, html } = createDebtReminderEmail(
      client.name,
      user?.name || "המטפל/ת שלך",
      sessionsWithDebt,
      totalDebt,
      {
        paymentInstructions: commSettings?.paymentInstructions,
        paymentLink: commSettings?.paymentLink,
        emailSignature: commSettings?.emailSignature,
        customGreeting: commSettings?.customGreeting,
        customClosing: commSettings?.customClosing,
        businessHours: commSettings?.businessHours,
      }
    );

    // Send email
    const result = await sendEmail({
      to: client.email,
      subject,
      html,
    });

    // Log communication
    await prisma.communicationLog.create({
      data: {
        type: "CUSTOM",
        channel: "EMAIL",
        recipient: client.email.toLowerCase(),
        subject,
        content: html,
        status: result.success ? "SENT" : "FAILED",
        errorMessage: result.success ? null : String(result.error),
        sentAt: result.success ? new Date() : null,
        messageId: result.messageId || null,
        clientId: clientId,
        userId: userId,
      },
    });

    // Send SMS debt reminder (independent from email)
    const smsResult = await sendSMSIfEnabled({
      userId: userId,
      phone: client.phone,
      template: commSettings?.templateDebtReminderSMS,
      defaultTemplate: "שלום {שם}, יש יתרה פתוחה של {סכום}. פרטים נשלחו במייל",
      placeholders: {
        שם: client.firstName || client.name,
        סכום: `₪${totalDebt}`,
      },
      settingKey: "sendDebtReminderSMS",
      clientId: clientId,
      type: "DEBT_REMINDER",
    });

    // ⭐ החזרה אמיתית של תוצאת השליחה — לא "success: true" קשיח.
    //    בשבת/חג: result.shabbatBlocked=true → מחזירים 200 עם הודעה ברורה.
    if (result.shabbatBlocked || smsResult.shabbatBlocked) {
      return NextResponse.json({
        success: false,
        shabbatBlocked: true,
        message: "התזכורת לא נשלחה — שבת/חג. ניתן לשלוח שוב במוצאי שבת/חג.",
      });
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: "שגיאה בשליחת המייל",
          error: result.error,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "תזכורת נשלחה בהצלחה",
    });
  } catch (error) {
    logger.error("Error sending debt reminder:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
