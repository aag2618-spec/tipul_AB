import { Resend } from 'resend';
import { escapeHtml } from './email-utils';

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
}

// All replies are routed through inbox@mytipul.com so the Resend webhook
// captures them and the system displays them in the communication history.
export async function sendEmail({ to, subject, html, text }: EmailOptions) {
  const resend = getResendClient();
  
  if (!resend) {
    console.warn('RESEND_API_KEY not set, skipping email');
    return { success: false, error: 'API key not configured', messageId: null };
  }

  const normalizedTo = to.toLowerCase();

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Tipul App <onboarding@resend.dev>',
        to: normalizedTo,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
        replyTo: "inbox@mytipul.com",
      });

      if (error) {
        console.error(`Resend error (attempt ${attempt}/${maxAttempts}):`, error);
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        return { success: false, error: error.message, messageId: null };
      }

      // Return the message ID for tracking
      return { success: true, data, messageId: data?.id || null };
    } catch (error) {
      console.error(`Send email error (attempt ${attempt}/${maxAttempts}):`, error);
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      return { success: false, error: 'Failed to send email', messageId: null };
    }
  }
  return { success: false, error: 'Failed after retries', messageId: null };
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
    timeZone: 'Asia/Jerusalem',
  });
  const formattedTime = sessionDate.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  });

  const typeLabel = sessionType === 'ONLINE' ? 'אונליין' : sessionType === 'PHONE' ? 'טלפונית' : 'פרונטלית';

  const safeName = escapeHtml(patientName);
  const safeTherapist = escapeHtml(therapistName);

  return {
    subject: `תזכורת: פגישה עם ${therapistName} ב-${formattedDate}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">שלום ${safeName},</h2>
        <p>זוהי תזכורת לפגישה שלך:</p>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>תאריך:</strong> ${formattedDate}</p>
          <p><strong>שעה:</strong> ${formattedTime}</p>
          <p><strong>סוג פגישה:</strong> ${typeLabel}</p>
          <p><strong>מטפל/ת:</strong> ${safeTherapist}</p>
        </div>
        <p>במידה ויש שינוי, נא לעדכן בהקדם.</p>
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          בברכה,<br/>
          ${safeTherapist}
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
  const safeContent = escapeHtml(content);
  const safeRecipient = escapeHtml(recipientName);
  const safeSender = escapeHtml(senderName);

  const trimmed = content.trim();
  const hasGreeting = /^שלום\s/.test(trimmed);
  const hasClosing = /בברכה[,]?\s*$/m.test(trimmed) || /בהצלחה[!]?\s*$/m.test(trimmed);

  const greeting = hasGreeting ? "" : `<h2 style="color: #333;">שלום ${safeRecipient},</h2>`;
  const closing = hasClosing ? "" : `<p style="color: #666; font-size: 14px; margin-top: 30px;">בברכה,<br/>${safeSender}</p>`;

  return {
    subject,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${greeting}
        <div style="white-space: pre-wrap; line-height: 1.6;">${safeContent}</div>
        ${closing}
      </div>
    `,
  };
}


