import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/email-utils";
import { sendSMSIfEnabled } from "@/lib/sms";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { syncSessionToGoogleCalendar, syncSessionDeletionToGoogleCalendar } from "@/lib/google-calendar-sync";

export const dynamic = "force-dynamic";

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING_APPROVAL: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  PENDING_CANCELLATION: ["CANCELLED", "SCHEDULED"],
};

function formatDateHebrew(date: Date): string {
  return date.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTimeHebrew(date: Date): string {
  return date.toLocaleTimeString("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id: sessionId } = await params;
    const { status, cancellationReason } = await req.json();

    const validStatuses = Object.keys(VALID_TRANSITIONS);
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ message: "Invalid status" }, { status: 400 });
    }

    const therapySession = await prisma.therapySession.findFirst({
      where: {
        id: sessionId,
        OR: [
          { therapistId: userId },
          { client: { therapistId: userId } },
        ],
      },
      include: {
        client: { select: { name: true, firstName: true, email: true, phone: true } },
        therapist: { select: { name: true, email: true, phone: true, businessPhone: true } },
      },
    });

    if (!therapySession) {
      return NextResponse.json({ message: "Session not found" }, { status: 404 });
    }

    const currentStatus = therapySession.status;
    const allowedNext = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(status)) {
      return NextResponse.json(
        { error: `לא ניתן לשנות סטטוס מ-${currentStatus} ל-${status}` },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = { status };
    if (status === "CANCELLED" || status === "NO_SHOW") {
      updateData.cancelledAt = new Date();
      updateData.cancelledBy = "THERAPIST";
      if (cancellationReason) updateData.cancellationReason = cancellationReason;
    }

    const updatedSession = await prisma.therapySession.update({
      where: { id: sessionId },
      data: updateData,
    });

    // Google Calendar sync (non-blocking)
    if (currentStatus === "PENDING_APPROVAL" && status === "SCHEDULED") {
      // הזמנה אושרה — ליצור אירוע ביומן
      syncSessionToGoogleCalendar(userId, {
        id: sessionId,
        clientName: therapySession.client?.name || null,
        type: therapySession.type,
        startTime: therapySession.startTime,
        endTime: therapySession.endTime,
        location: therapySession.location,
        topic: null,
      }).catch((err) => logger.error("[GoogleCalendarSync] Error:", { error: err instanceof Error ? err.message : String(err) }));
    }
    if ((status === "CANCELLED" || status === "NO_SHOW") && therapySession.googleEventId) {
      // פגישה בוטלה — למחוק מהיומן
      syncSessionDeletionToGoogleCalendar(userId, sessionId, therapySession.googleEventId)
        .catch((err) => logger.error("[GoogleCalendarSync] Delete error:", { error: err instanceof Error ? err.message : String(err) }));
    }

    // Send email to client when approving/rejecting a booking request
    if (currentStatus === "PENDING_APPROVAL" && therapySession.client?.email) {
      const clientName = therapySession.client.name;
      const therapistName = therapySession.therapist?.name || "המטפל/ת";
      const dateStr = formatDateHebrew(therapySession.startTime);
      const timeStr = formatTimeHebrew(therapySession.startTime);

      let emailSubject = "";
      let emailHtml = "";

      if (status === "SCHEDULED") {
        emailSubject = `התור שלך אושר - ${therapistName}`;
        emailHtml = `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
            <h2 style="color: #059669;">התור שלך אושר!</h2>
            <p>שלום ${escapeHtml(clientName)},</p>
            <p>שמחים לעדכן אותך שהתור שלך אושר על ידי ${escapeHtml(therapistName)}.</p>
            <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #059669;">
              <p style="margin: 8px 0;"><strong>תאריך:</strong> ${dateStr}</p>
              <p style="margin: 8px 0;"><strong>שעה:</strong> ${timeStr}</p>
              <p style="margin: 8px 0;"><strong>מטפל/ת:</strong> ${escapeHtml(therapistName)}</p>
            </div>
            <p>לביטול או שינוי תור, נא ליצור קשר לפחות 24 שעות מראש.</p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">בברכה,<br/>${escapeHtml(therapistName)}</p>
            <p style="color: #999; font-size: 12px; margin-top: 20px;">מופעל על ידי MyTipul</p>
          </div>`;
      } else if (status === "CANCELLED") {
        emailSubject = `עדכון לגבי בקשת הזימון - ${therapistName}`;
        emailHtml = `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
            <h2 style="color: #dc2626;">הבקשה לא אושרה</h2>
            <p>שלום ${escapeHtml(clientName)},</p>
            <p>לצערנו, בקשת הזימון שלך לא אושרה על ידי ${escapeHtml(therapistName)}.</p>
            <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #dc2626;">
              <p style="margin: 8px 0;"><strong>תאריך:</strong> ${dateStr}</p>
              <p style="margin: 8px 0;"><strong>שעה:</strong> ${timeStr}</p>
              ${cancellationReason ? `<p style="margin: 8px 0;"><strong>סיבה:</strong> ${escapeHtml(cancellationReason)}</p>` : ""}
            </div>
            <p>ניתן לנסות לקבוע מועד אחר דרך דף הזימון.</p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">בברכה,<br/>${escapeHtml(therapistName)}</p>
            <p style="color: #999; font-size: 12px; margin-top: 20px;">מופעל על ידי MyTipul</p>
          </div>`;
      }

      if (emailSubject) {
        try {
          const result = await sendEmail({
            to: therapySession.client.email,
            subject: emailSubject,
            html: emailHtml,
          });
          await prisma.communicationLog.create({
            data: {
              type: status === "SCHEDULED" ? "BOOKING_APPROVED" : "BOOKING_REJECTED",
              channel: "EMAIL",
              recipient: therapySession.client.email,
              subject: emailSubject,
              content: emailHtml,
              status: result.success ? "SENT" : "FAILED",
              errorMessage: result.success ? null : String(result.error),
              sentAt: result.success ? new Date() : null,
              messageId: result.messageId || null,
              sessionId,
              clientId: therapySession.clientId,
              userId: userId,
            },
          });
        } catch (e) {
          logger.error("Failed to send booking status email:", { error: e instanceof Error ? e.message : String(e) });
        }
      }
    }

    if (currentStatus === "PENDING_APPROVAL") {
      try {
        await prisma.notification.updateMany({
          where: {
            userId: userId,
            type: "BOOKING_REQUEST",
            status: { in: ["PENDING", "SENT"] },
            content: { contains: sessionId },
          },
          data: { status: "READ", readAt: new Date() },
        });
      } catch (e) {
        logger.error("Failed to clean up notifications:", { error: e instanceof Error ? e.message : String(e) });
      }
    }

    // ── Send cancellation notification (email + SMS) when therapist cancels a SCHEDULED session ──
    if (currentStatus === "SCHEDULED" && status === "CANCELLED" && therapySession.client) {
      const clientName = therapySession.client.name;
      const therapistName = therapySession.therapist?.name || "המטפל/ת";
      const dateStr = formatDateHebrew(therapySession.startTime);
      const timeStr = formatTimeHebrew(therapySession.startTime);

      // Get communication settings
      const commSettings = await prisma.communicationSetting.findUnique({
        where: { userId },
      });

      // Send cancellation email if enabled
      if (commSettings?.sendCancellationEmail !== false && therapySession.client.email) {
        try {
          const cancelSubject = `הפגישה בוטלה - ${escapeHtml(therapistName)}`;
          const cancelHtml = `
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
              <h2 style="color: #dc2626;">הפגישה בוטלה</h2>
              <p>${commSettings?.customGreeting ? escapeHtml(commSettings.customGreeting.replace(/{שם}/g, clientName)) : `שלום ${escapeHtml(clientName)}`},</p>
              <p>הפגישה הבאה בוטלה:</p>
              <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #dc2626;">
                <p style="margin: 8px 0;"><strong>תאריך:</strong> ${dateStr}</p>
                <p style="margin: 8px 0;"><strong>שעה:</strong> ${timeStr}</p>
                ${cancellationReason ? `<p style="margin: 8px 0;"><strong>סיבה:</strong> ${escapeHtml(cancellationReason)}</p>` : ""}
              </div>
              <p>ליצירת קשר לקביעת מועד חדש, אנא פנה/י ישירות.</p>
              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                ${escapeHtml(commSettings?.customClosing || "בברכה")},<br/>
                ${escapeHtml(commSettings?.emailSignature || therapistName)}
              </p>
            </div>`;

          const result = await sendEmail({
            to: therapySession.client.email,
            subject: cancelSubject,
            html: cancelHtml,
          });
          await prisma.communicationLog.create({
            data: {
              type: "CANCELLATION_BY_THERAPIST",
              channel: "EMAIL",
              recipient: therapySession.client.email,
              subject: cancelSubject,
              content: cancelHtml,
              status: result.success ? "SENT" : "FAILED",
              errorMessage: result.success ? null : String(result.error),
              sentAt: result.success ? new Date() : null,
              messageId: result.messageId || null,
              sessionId,
              clientId: therapySession.clientId,
              userId,
            },
          });
        } catch (e) {
          logger.error("Failed to send cancellation email:", { error: e instanceof Error ? e.message : String(e) });
        }
      }

      // Send cancellation SMS
      await sendSMSIfEnabled({
        userId,
        phone: therapySession.client.phone,
        template: commSettings?.templateCancellationSMS,
        defaultTemplate: "שלום {שם}, הפגישה ב-{תאריך} ב-{שעה} בוטלה",
        placeholders: {
          שם: therapySession.client.name,
          תאריך: dateStr,
          שעה: timeStr,
        },
        settingKey: "sendCancellationSMS",
        sessionId,
        clientId: therapySession.clientId || undefined,
        type: "CANCELLATION_BY_THERAPIST",
      });
    }

    // ── Send no-show notification (email + SMS) ──
    if (currentStatus === "SCHEDULED" && status === "NO_SHOW" && therapySession.client) {
      const clientName = therapySession.client.name;
      const therapistName = therapySession.therapist?.name || "המטפל/ת";
      const dateStr = formatDateHebrew(therapySession.startTime);

      const commSettings = await prisma.communicationSetting.findUnique({
        where: { userId },
      });

      // Send no-show email if enabled
      if (commSettings?.sendNoShowEmail && therapySession.client.email) {
        try {
          const noShowSubject = `לא הגעת לפגישה - ${escapeHtml(therapistName)}`;
          const noShowHtml = `
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
              <h2 style="color: #f59e0b;">לא הגעת לפגישה</h2>
              <p>${commSettings?.customGreeting ? escapeHtml(commSettings.customGreeting.replace(/{שם}/g, clientName)) : `שלום ${escapeHtml(clientName)}`},</p>
              <p>שמנו לב שלא הגעת לפגישה שנקבעה ל-${dateStr}.</p>
              <p>אם ברצונך לקבוע מועד חדש, אנא צור/י קשר.</p>
              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                ${escapeHtml(commSettings?.customClosing || "בברכה")},<br/>
                ${escapeHtml(commSettings?.emailSignature || therapistName)}
              </p>
            </div>`;

          const result = await sendEmail({
            to: therapySession.client.email,
            subject: noShowSubject,
            html: noShowHtml,
          });
          await prisma.communicationLog.create({
            data: {
              type: "NO_SHOW_NOTIFICATION",
              channel: "EMAIL",
              recipient: therapySession.client.email,
              subject: noShowSubject,
              content: noShowHtml,
              status: result.success ? "SENT" : "FAILED",
              errorMessage: result.success ? null : String(result.error),
              sentAt: result.success ? new Date() : null,
              messageId: result.messageId || null,
              sessionId,
              clientId: therapySession.clientId,
              userId,
            },
          });
        } catch (e) {
          logger.error("Failed to send no-show email:", { error: e instanceof Error ? e.message : String(e) });
        }
      }

      // Send no-show SMS
      await sendSMSIfEnabled({
        userId,
        phone: therapySession.client.phone,
        template: commSettings?.templateNoShowSMS,
        defaultTemplate: "שלום {שם}, חבל שלא הגעת היום. ליצירת קשר: {טלפון}",
        placeholders: {
          שם: therapySession.client.name,
          תאריך: dateStr,
          טלפון: therapySession.therapist?.businessPhone || therapySession.therapist?.phone || "",
        },
        settingKey: "sendNoShowSMS",
        sessionId,
        clientId: therapySession.clientId || undefined,
        type: "NO_SHOW_NOTIFICATION",
      });
    }

    return NextResponse.json(updatedSession);
  } catch (error) {
    logger.error("Error updating session status:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to update session status" },
      { status: 500 }
    );
  }
}
