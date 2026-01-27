import { Resend } from 'resend';

// Initialize lazily to avoid build errors when API key is not set
let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string; // המייל של המטפל - תשובות יגיעו אליו
}

export async function sendEmail({ to, subject, html, text, replyTo }: EmailOptions) {
  const resend = getResendClient();
  
  if (!resend) {
    console.warn('RESEND_API_KEY not set, skipping email');
    return { success: false, error: 'API key not configured', messageId: null };
  }

  // המרה לאותיות קטנות - חובה עבור Resend Sandbox
  const normalizedTo = to.toLowerCase();
  const normalizedReplyTo = replyTo?.toLowerCase();

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Tipul App <onboarding@resend.dev>',
      to: normalizedTo,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
      ...(normalizedReplyTo && { replyTo: normalizedReplyTo }), // תשובות יגיעו למטפל
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message, messageId: null };
    }

    // Return the message ID for tracking
    return { success: true, data, messageId: data?.id || null };
  } catch (error) {
    console.error('Send email error:', error);
    return { success: false, error: 'Failed to send email', messageId: null };
  }
}

// Email templates
export function createSessionReminderEmail(
  patientName: string,
  therapistName: string,
  sessionDate: Date,
  sessionType: string
) {
  const formattedDate = sessionDate.toLocaleDateString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = sessionDate.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const typeLabel = sessionType === 'ONLINE' ? 'אונליין' : sessionType === 'PHONE' ? 'טלפונית' : 'פרונטלית';

  return {
    subject: `תזכורת: פגישה עם ${therapistName} ב-${formattedDate}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">שלום ${patientName},</h2>
        <p>זוהי תזכורת לפגישה שלך:</p>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>תאריך:</strong> ${formattedDate}</p>
          <p><strong>שעה:</strong> ${formattedTime}</p>
          <p><strong>סוג פגישה:</strong> ${typeLabel}</p>
          <p><strong>מטפל/ת:</strong> ${therapistName}</p>
        </div>
        <p>במידה ויש שינוי, נא לעדכן בהקדם.</p>
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          בברכה,<br/>
          ${therapistName}
        </p>
      </div>
    `,
  };
}

export function createGenericEmail(
  recipientName: string,
  subject: string,
  content: string,
  senderName: string
) {
  return {
    subject,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">שלום ${recipientName},</h2>
        <div style="white-space: pre-wrap; line-height: 1.6;">${content}</div>
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          בברכה,<br/>
          ${senderName}
        </p>
      </div>
    `,
  };
}


