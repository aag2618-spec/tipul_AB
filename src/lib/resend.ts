import { Resend } from 'resend';
import { escapeHtml } from './email-utils';
import { isShabbatOrYomTov } from './shabbat';
import { logger } from './logger';

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

export interface SendEmailResult {
  success: boolean;
  error?: string;
  shabbatBlocked?: boolean;
  data?: unknown;
  messageId: string | null;
}

// All replies are routed through inbox@mytipul.com so the Resend webhook
// captures them and the system displays them in the communication history.
export async function sendEmail({ to, subject, html, text }: EmailOptions): Promise<SendEmailResult> {
  // שבת/יו״ט — חסום מיידי, לפני כל תלות חיצונית.
  // ה-callers ממשיכים לזרום רגיל (result.success=false) ולא נזרקת חריגה.
  if (isShabbatOrYomTov()) {
    logger.info('[email] חסום בשבת/חג', { to, subject });
    return {
      success: false,
      error: 'SHABBAT_BLOCKED',
      shabbatBlocked: true,
      messageId: null,
    };
  }

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

// ─────────────────────────────────────────────────────────────────────
// sendEmailRaw — system-only, bypasses Shabbat gate
// ─────────────────────────────────────────────────────────────────────
//
// ⚠️ SYSTEM-ONLY — עוקף את בדיקת השבת/חג!
// NEVER use for user-facing emails (לקוחות, מטפלים).
// מיועד *רק* להתראות מערכת קריטיות שחייבות להישלח גם בשבת כדי להתריע
// על תקלה (למשל: כשל בחישוב זמני שבת ב-hebcal).
//
// ההגנה: נמענים מורשים בלבד לפי env var SYSTEM_RAW_RECIPIENTS (או ADMIN_EMAIL
// כברירת מחדל). ניסיון לשלוח לכתובת לא מורשה נכשל בשקט + לוג שגיאה.
// ─────────────────────────────────────────────────────────────────────

function getSystemRawAllowlist(): Set<string> {
  const raw = process.env.SYSTEM_RAW_RECIPIENTS ?? process.env.ADMIN_EMAIL ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function sendEmailRaw(
  params: EmailOptions,
): Promise<{ success: boolean; error?: string }> {
  const to = params.to.toLowerCase();
  const allowlist = getSystemRawAllowlist();
  if (!allowlist.has(to)) {
    console.error('[sendEmailRaw] BLOCKED — recipient not in SYSTEM_RAW_RECIPIENTS allowlist', {
      to,
      allowlistSize: allowlist.size,
    });
    return { success: false, error: 'RECIPIENT_NOT_ALLOWED' };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: false, error: 'API key not configured' };
  }

  try {
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Tipul App <onboarding@resend.dev>',
      to,
      subject: `[SYSTEM] ${params.subject}`,
      html: params.html,
      text: params.text || params.html.replace(/<[^>]*>/g, ''),
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown' };
  }
}
