import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { sendSMSIfEnabled } from "@/lib/sms";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import { logger } from "@/lib/logger";
import { checkCronAuth } from "@/lib/cron-auth";

/**
 * Booking Outbox Cron — פוסטמן לשליחת הודעות שנדחו בשבת/חג.
 *
 * כרגע הזימון העצמי הציבורי חסום לגמרי בשבת — לכן רוב הסיכוי שלא יהיו רשומות
 * ממתינות. ה-cron משמש כשכבת הגנה:
 *
 * - אם code עתידי יסמן `pendingConfirmation*` על פגישה שנוצרה בשבת
 * - אם תהליך ידני של מטפל בדשבורד ישאיר הודעות "תקועות"
 *
 * הלוגיקה:
 * 1. מדלג על שבת/חג (חוזר later).
 * 2. מוצא TherapySession עם דגלי pending פעילים.
 * 3. לכל אחת: atomic lock (updateMany עם תנאי על הדגל) ואז שליחה.
 *    אם השליחה נכשלה — מחזיר את הדגל ל-true כדי שהריצה הבאה תנסה שוב.
 *
 * תזמון מומלץ: כל 15 דקות.
 */

export const dynamic = "force-dynamic";

type SessionWithRelations = Prisma.TherapySessionGetPayload<{
  include: { client: true; therapist: true };
}>;

export async function GET(request: NextRequest) {
  const guard = await checkCronAuth(request);
  if (guard) return guard;

  if (isShabbatOrYomTov()) {
    logger.info("[cron booking-outbox] דילוג בשבת/חג");
    return NextResponse.json({ skipped: true, reason: "shabbat_or_yomtov" });
  }

  const pending = await prisma.therapySession.findMany({
    where: {
      OR: [
        { pendingConfirmationEmail: true },
        { pendingConfirmationSms: true },
        { pendingTherapistNotifyEmail: true },
      ],
      // רק פגישות פעילות (לא בוטלו)
      status: { notIn: ["CANCELLED"] },
    },
    include: {
      client: true,
      therapist: true,
    },
  });

  if (pending.length === 0) {
    return NextResponse.json({ processed: 0, total: 0 });
  }

  let processed = 0;
  const errors: string[] = [];

  for (const session of pending) {
    try {
      const didWork = await processOutboxSession(session);
      if (didWork) processed++;
    } catch (err) {
      errors.push(`Session ${session.id}: ${err instanceof Error ? err.message : String(err)}`);
      logger.error("[cron booking-outbox] error processing session", {
        sessionId: session.id,
        error: err,
      });
    }
  }

  return NextResponse.json({
    processed,
    total: pending.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

/**
 * מעבד session יחיד — לוקח lock atomic על כל דגל, שולח, ומחזיר את הדגל
 * רק אם השליחה נכשלה (כדי לאפשר retry).
 */
async function processOutboxSession(session: SessionWithRelations): Promise<boolean> {
  let didWork = false;

  // ─── מייל אישור ללקוח ─────────────────────────────────────────
  if (session.pendingConfirmationEmail && session.client?.email) {
    const lock = await prisma.therapySession.updateMany({
      where: { id: session.id, pendingConfirmationEmail: true },
      data: { pendingConfirmationEmail: false },
    });
    if (lock.count === 1) {
      const { subject, html } = buildClientConfirmationEmail(session);
      const r = await sendEmail({ to: session.client.email, subject, html });
      if (r.success) {
        didWork = true;
      } else {
        // שחרור ה-lock — ננסה שוב במוצ"ש/בריצה הבאה
        await prisma.therapySession.update({
          where: { id: session.id },
          data: { pendingConfirmationEmail: true },
        });
        logger.warn("[cron booking-outbox] client email failed, re-queued", {
          sessionId: session.id,
          error: r.error,
        });
      }
    }
  }

  // ─── SMS ללקוח ────────────────────────────────────────────────
  if (session.pendingConfirmationSms && session.client?.phone) {
    const lock = await prisma.therapySession.updateMany({
      where: { id: session.id, pendingConfirmationSms: true },
      data: { pendingConfirmationSms: false },
    });
    if (lock.count === 1) {
      const r = await sendSMSIfEnabled({
        userId: session.therapistId,
        phone: session.client.phone,
        template: null,
        defaultTemplate: "שלום {שם}, אישור פגישה ב-{תאריך} בשעה {שעה}",
        placeholders: {
          שם: session.client.firstName || session.client.name,
          תאריך: formatIsraelDate(session.startTime),
          שעה: formatIsraelTime(session.startTime),
        },
        settingKey: "sendBookingConfirmationSMS",
        sessionId: session.id,
        clientId: session.clientId ?? undefined,
        type: "SESSION_CONFIRMATION",
      });
      if (r.success) {
        didWork = true;
      } else {
        await prisma.therapySession.update({
          where: { id: session.id },
          data: { pendingConfirmationSms: true },
        });
        logger.warn("[cron booking-outbox] client SMS failed, re-queued", {
          sessionId: session.id,
          error: r.error,
        });
      }
    }
  }

  // ─── מייל התראה למטפל ──────────────────────────────────────────
  if (session.pendingTherapistNotifyEmail && session.therapist?.email) {
    const lock = await prisma.therapySession.updateMany({
      where: { id: session.id, pendingTherapistNotifyEmail: true },
      data: { pendingTherapistNotifyEmail: false },
    });
    if (lock.count === 1) {
      const { subject, html } = buildTherapistNotifyEmail(session);
      const r = await sendEmail({ to: session.therapist.email, subject, html });
      if (r.success) {
        didWork = true;
      } else {
        await prisma.therapySession.update({
          where: { id: session.id },
          data: { pendingTherapistNotifyEmail: true },
        });
        logger.warn("[cron booking-outbox] therapist notify failed, re-queued", {
          sessionId: session.id,
          error: r.error,
        });
      }
    }
  }

  return didWork;
}

// ─── Email templates ─────────────────────────────────────────────

function formatIsraelDate(d: Date): string {
  return d.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatIsraelTime(d: Date): string {
  return d.toLocaleTimeString("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildClientConfirmationEmail(session: SessionWithRelations): {
  subject: string;
  html: string;
} {
  const clientName = session.client?.firstName || session.client?.name || "";
  const therapistName = session.therapist?.name ?? "המטפל/ת";
  const date = formatIsraelDate(session.startTime);
  const time = formatIsraelTime(session.startTime);
  const isPending = session.status === "PENDING_APPROVAL";

  const subject = isPending
    ? `בקשת זימון - ${therapistName}`
    : `אישור תור - ${therapistName}`;

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
      <h2 style="color: #0f766e;">שלום ${escapeHtml(clientName)},</h2>
      <p>${isPending ? "בקשת הזימון שלך התקבלה וממתינה לאישור המטפל/ת." : "התור שלך אושר בהצלחה!"}</p>
      <div style="background: #f0fdfa; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #0f766e;">
        <p style="margin: 8px 0;"><strong>תאריך:</strong> ${date}</p>
        <p style="margin: 8px 0;"><strong>שעה:</strong> ${time}</p>
        <p style="margin: 8px 0;"><strong>מטפל/ת:</strong> ${escapeHtml(therapistName)}</p>
      </div>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">בברכה,<br/>${escapeHtml(therapistName)}</p>
    </div>`;

  return { subject, html };
}

function buildTherapistNotifyEmail(session: SessionWithRelations): {
  subject: string;
  html: string;
} {
  const clientName = session.client?.name ?? "לקוח";
  const date = formatIsraelDate(session.startTime);
  const time = formatIsraelTime(session.startTime);

  const subject = `בקשת זימון חדשה מ-${clientName}`;
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
      <h2 style="color: #0f766e;">בקשת זימון חדשה</h2>
      <p>${escapeHtml(clientName)} ביקש/ה לקבוע תור:</p>
      <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #f59e0b;">
        <p style="margin: 8px 0;"><strong>תאריך:</strong> ${date}</p>
        <p style="margin: 8px 0;"><strong>שעה:</strong> ${time}</p>
        ${session.client?.phone ? `<p style="margin: 8px 0;"><strong>טלפון:</strong> ${escapeHtml(session.client.phone)}</p>` : ""}
        ${session.client?.email ? `<p style="margin: 8px 0;"><strong>מייל:</strong> ${escapeHtml(session.client.email)}</p>` : ""}
      </div>
    </div>`;

  return { subject, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
