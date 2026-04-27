import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { parseIsraelTime } from "@/lib/date-utils";
import { createPaymentForSession } from "@/lib/payment-service";
import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/email-utils";
import { sendSMSIfEnabled } from "@/lib/sms";
import { logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { syncSessionUpdateToGoogleCalendar, syncSessionDeletionToGoogleCalendar } from "@/lib/google-calendar-sync";
import { logDataAccess } from "@/lib/audit-logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const therapySession = await prisma.therapySession.findFirst({
      where: { id, therapistId: userId },
      include: {
        client: true,
        sessionNote: true,
        sessionAnalysis: true,
        payment: true,
        recordings: {
          include: {
            transcription: {
              include: { analysis: true },
            },
          },
        },
      },
    });

    if (!therapySession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    // Audit log — קריאה לפגישה כוללת sessionNote.content + transcription.content
    logDataAccess({
      userId,
      recordType: "SESSION_DETAIL",
      recordId: id,
      action: "READ",
      clientId: therapySession.clientId,
      request,
      meta: {
        hasNote: !!therapySession.sessionNote,
        hasTranscription: therapySession.recordings.some((r) => r.transcription),
      },
    });

    return NextResponse.json(serializePrisma(therapySession));
  } catch (error) {
    logger.error("Get session error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הפגישה" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;
    const body = await request.json();
    const { startTime, endTime, type, price, location, notes, topic, status, createPayment, markAsPaid, cancellationReason } = body;

    const existingSession = await prisma.therapySession.findFirst({
      where: { id, therapistId: userId },
      include: {
        client: {
          select: {
            defaultSessionPrice: true,
          },
        },
      },
    });

    if (!existingSession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    // If no price provided, use client's default price
    const finalPrice = price !== undefined
      ? price
      : (existingSession.client?.defaultSessionPrice
          ? Number(existingSession.client.defaultSessionPrice)
          : undefined);

    // Check for overlaps when changing time
    if (startTime || endTime) {
      const newStart = startTime ? parseIsraelTime(startTime) : existingSession.startTime;
      const newEnd = endTime ? parseIsraelTime(endTime) : existingSession.endTime;

      const conflict = await prisma.therapySession.findFirst({
        where: {
          therapistId: userId,
          id: { not: id }, // exclude this session
          status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
          OR: [
            {
              AND: [
                { startTime: { lte: newStart } },
                { endTime: { gt: newStart } },
              ],
            },
            {
              AND: [
                { startTime: { lt: newEnd } },
                { endTime: { gte: newEnd } },
              ],
            },
            {
              AND: [
                { startTime: { gte: newStart } },
                { endTime: { lte: newEnd } },
              ],
            },
          ],
        },
        include: {
          client: { select: { name: true } },
        },
      });

      if (conflict) {
        const conflictName = conflict.client?.name || (conflict.type === "BREAK" ? "הפסקה" : "פגישה");
        const conflictStart = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(conflict.startTime);
        const conflictEnd = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(conflict.endTime);
        return NextResponse.json(
          { message: `יש התנגשות עם ${conflictName} בשעה ${conflictStart}-${conflictEnd}` },
          { status: 409 }
        );
      }
    }

    const therapySession = await prisma.therapySession.update({
      where: { id },
      data: {
        startTime: startTime ? parseIsraelTime(startTime) : undefined,
        endTime: endTime ? parseIsraelTime(endTime) : undefined,
        type: type || undefined,
        price: finalPrice,
        topic: topic !== undefined ? topic : undefined,
        location: location !== undefined ? location : undefined,
        notes: notes !== undefined ? notes : undefined,
        status: status || undefined,
        // שמירת פרטי ביטול/אי הופעה
        ...(cancellationReason ? { cancellationReason } : {}),
        ...((status === "CANCELLED" || status === "NO_SHOW") ? {
          cancelledAt: new Date(),
          cancelledBy: "THERAPIST",
        } : {}),
      },
      include: {
        client: true,
        sessionNote: true,
      },
    });

    // Google Calendar sync (non-blocking)
    if (existingSession.googleEventId) {
      if (status === "CANCELLED" || status === "NO_SHOW") {
        syncSessionDeletionToGoogleCalendar(userId, therapySession.id, existingSession.googleEventId)
          .catch((err) => logger.error("[GoogleCalendarSync] Delete error:", { error: err instanceof Error ? err.message : String(err) }));
      } else if (startTime || endTime || location) {
        syncSessionUpdateToGoogleCalendar(userId, {
          clientName: therapySession.client?.name || null,
          startTime: therapySession.startTime,
          endTime: therapySession.endTime,
          location: therapySession.location,
        }, existingSession.googleEventId)
          .catch((err) => logger.error("[GoogleCalendarSync] Update error:", { error: err instanceof Error ? err.message : String(err) }));
      }
    }

    // יצירת תשלום אם צריך (הושלם, או ביטול/אי הופעה עם בקשה לחיוב)
    const shouldCreatePayment =
      (status === "COMPLETED" || therapySession.status === "COMPLETED") ||
      (createPayment && (status === "CANCELLED" || status === "NO_SHOW"));

    if (shouldCreatePayment && therapySession.price && therapySession.clientId) {
      // בדוק אם כבר קיים תשלום ממתין או שולם לפגישה זו
      const existingPayment = await prisma.payment.findFirst({
        where: {
          sessionId: therapySession.id,
          status: { in: ["PENDING", "PAID"] },
        },
      });
      if (!existingPayment) {
        const paymentResult = await createPaymentForSession({
          userId,
          clientId: therapySession.clientId,
          sessionId: therapySession.id,
          amount: markAsPaid ? Number(therapySession.price) : 0,
          expectedAmount: Number(therapySession.price),
          method: "CASH",
          paymentType: "FULL",
        });

        // אם יצירת התשלום נכשלה - מחזירים את הפגישה למצב הקודם
        if (!paymentResult.success) {
          await prisma.therapySession.update({
            where: { id },
            data: {
              status: existingSession.status,
            },
          });
          return NextResponse.json(
            { message: paymentResult.error || "שגיאה ביצירת התשלום, הפגישה לא עודכנה" },
            { status: 500 }
          );
        }
      }
    }

    // ── Send session change notification (email + SMS) when time/date changed ──
    const timeChanged = startTime && existingSession.startTime.getTime() !== therapySession.startTime.getTime();
    if (timeChanged && existingSession.status === "SCHEDULED" && therapySession.client) {
      const commSettings = await prisma.communicationSetting.findUnique({
        where: { userId },
      });
      const therapist = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      const therapistName = therapist?.name || "המטפל/ת";

      const newDateStr = therapySession.startTime.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", year: "numeric", month: "long", day: "numeric" });
      const newTimeStr = therapySession.startTime.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
      const clientName = therapySession.client.name;

      // Send change email if enabled
      if (commSettings?.sendSessionChangeEmail !== false && therapySession.client.email) {
        try {
          const changeSubject = `שינוי מועד פגישה - ${escapeHtml(therapistName)}`;
          const changeHtml = `
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
              <h2 style="color: #f59e0b;">שינוי מועד פגישה</h2>
              <p>${commSettings?.customGreeting ? escapeHtml(commSettings.customGreeting.replace(/{שם}/g, clientName)) : `שלום ${escapeHtml(clientName)}`},</p>
              <p>הפגישה שלך הועברה למועד חדש:</p>
              <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #f59e0b;">
                <p style="margin: 8px 0;"><strong>תאריך חדש:</strong> ${newDateStr}</p>
                <p style="margin: 8px 0;"><strong>שעה חדשה:</strong> ${newTimeStr}</p>
                <p style="margin: 8px 0;"><strong>מטפל/ת:</strong> ${escapeHtml(therapistName)}</p>
              </div>
              <p>אם המועד לא מתאים, נא ליצור קשר בהקדם.</p>
              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                ${escapeHtml(commSettings?.customClosing || "בברכה")},<br/>
                ${escapeHtml(commSettings?.emailSignature || therapistName)}
              </p>
            </div>`;

          const result = await sendEmail({ to: therapySession.client.email, subject: changeSubject, html: changeHtml });
          await prisma.communicationLog.create({
            data: {
              type: "SESSION_CHANGED",
              channel: "EMAIL",
              recipient: therapySession.client.email,
              subject: changeSubject,
              content: changeHtml,
              status: result.success ? "SENT" : "FAILED",
              errorMessage: result.success ? null : String(result.error),
              sentAt: result.success ? new Date() : null,
              messageId: result.messageId || null,
              sessionId: therapySession.id,
              clientId: therapySession.clientId,
              userId,
            },
          });
        } catch (e) {
          logger.error("Failed to send session change email:", { error: e instanceof Error ? e.message : String(e) });
        }
      }

      // Send change SMS
      await sendSMSIfEnabled({
        userId,
        phone: therapySession.client.phone,
        template: commSettings?.templateSessionChangeSMS,
        defaultTemplate: "שלום {שם}, הפגישה הועברה ל-{תאריך} ב-{שעה}",
        placeholders: {
          שם: clientName,
          תאריך: newDateStr,
          שעה: newTimeStr,
        },
        settingKey: "sendSessionChangeSMS",
        sessionId: therapySession.id,
        clientId: therapySession.clientId || undefined,
        type: "SESSION_CHANGED",
      });
    }

    // Fetch updated session with payment info
    const updatedSession = await prisma.therapySession.findUnique({
      where: { id: therapySession.id },
      include: {
        client: true,
        payment: true,
      },
    });

    return NextResponse.json(serializePrisma(updatedSession));
  } catch (error) {
    logger.error("Update session error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הפגישה" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;
    const body = await request.json();
    const { skipSummary } = body;

    const existingSession = await prisma.therapySession.findFirst({
      where: { id, therapistId: userId },
    });

    if (!existingSession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    const updatedSession = await prisma.therapySession.update({
      where: { id },
      data: {
        skipSummary: skipSummary !== undefined ? skipSummary : undefined,
      },
    });

    // WRITE_SUMMARY tasks no longer used - skipSummary flag on session is the source of truth

    return NextResponse.json(serializePrisma(updatedSession));
  } catch (error) {
    logger.error("Patch session error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הפגישה" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const existingSession = await prisma.therapySession.findFirst({
      where: { id, therapistId: userId },
    });

    if (!existingSession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    // Soft delete: cancel instead of hard delete, preserving history
    const now = new Date();
    const sessionStart = new Date(existingSession.startTime);
    const isPast = sessionStart < now;

    // Get therapist's cancellation policy
    const commSettings = await prisma.communicationSetting.findUnique({
      where: { userId },
      select: { minCancellationHours: true },
    });
    const minHours = commSettings?.minCancellationHours ?? 24;
    const hoursUntilSession = (sessionStart.getTime() - now.getTime()) / (1000 * 60 * 60);
    const withinChargeWindow = !isPast && hoursUntilSession < minHours;

    await prisma.therapySession.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledBy: "THERAPIST",
      },
    });

    // Google Calendar sync — delete event (non-blocking)
    if (existingSession.googleEventId) {
      syncSessionDeletionToGoogleCalendar(userId, id, existingSession.googleEventId)
        .catch((err) => logger.error("[GoogleCalendarSync] Delete error:", { error: err instanceof Error ? err.message : String(err) }));
    }

    // Dismiss related notifications
    try {
      await prisma.notification.updateMany({
        where: {
          userId,
          type: { in: ["BOOKING_REQUEST", "CANCELLATION_REQUEST", "SESSION_REMINDER"] },
          status: { in: ["PENDING", "SENT"] },
          content: { contains: id },
        },
        data: { status: "DISMISSED" },
      });
    } catch (e) {
      logger.error("Failed to clean up notifications:", { error: e instanceof Error ? e.message : String(e) });
    }

    // ── Send cancellation notification (email + SMS) ──
    if (existingSession.status === "SCHEDULED" && existingSession.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: existingSession.clientId },
        select: { name: true, firstName: true, email: true, phone: true },
      });
      const fullCommSettings = await prisma.communicationSetting.findUnique({ where: { userId } });
      const therapist = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      const therapistName = therapist?.name || "המטפל/ת";

      if (client) {
        const dateStr = existingSession.startTime.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", year: "numeric", month: "long", day: "numeric" });
        const timeStr = existingSession.startTime.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });

        // Send cancellation email if enabled
        if (fullCommSettings?.sendCancellationEmail !== false && client.email) {
          try {
            const cancelSubject = `הפגישה בוטלה - ${escapeHtml(therapistName)}`;
            const cancelHtml = `
              <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
                <h2 style="color: #dc2626;">הפגישה בוטלה</h2>
                <p>${fullCommSettings?.customGreeting ? escapeHtml(fullCommSettings.customGreeting.replace(/{שם}/g, client.name)) : `שלום ${escapeHtml(client.name)}`},</p>
                <p>הפגישה הבאה בוטלה:</p>
                <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #dc2626;">
                  <p style="margin: 8px 0;"><strong>תאריך:</strong> ${dateStr}</p>
                  <p style="margin: 8px 0;"><strong>שעה:</strong> ${timeStr}</p>
                </div>
                <p>ליצירת קשר לקביעת מועד חדש, אנא פנה/י ישירות.</p>
                <p style="color: #666; font-size: 14px; margin-top: 30px;">
                  ${escapeHtml(fullCommSettings?.customClosing || "בברכה")},<br/>
                  ${escapeHtml(fullCommSettings?.emailSignature || therapistName)}
                </p>
              </div>`;
            const result = await sendEmail({ to: client.email, subject: cancelSubject, html: cancelHtml });
            await prisma.communicationLog.create({
              data: {
                type: "CANCELLATION_BY_THERAPIST",
                channel: "EMAIL",
                recipient: client.email,
                subject: cancelSubject,
                content: cancelHtml,
                status: result.success ? "SENT" : "FAILED",
                errorMessage: result.success ? null : String(result.error),
                sentAt: result.success ? new Date() : null,
                messageId: result.messageId || null,
                sessionId: id,
                clientId: existingSession.clientId,
                userId,
              },
            });
          } catch (e) {
            logger.error("Failed to send cancellation email (DELETE):", { error: e instanceof Error ? e.message : String(e) });
          }
        }

        // Send cancellation SMS
        await sendSMSIfEnabled({
          userId,
          phone: client.phone,
          template: fullCommSettings?.templateCancellationSMS,
          defaultTemplate: "שלום {שם}, הפגישה ב-{תאריך} ב-{שעה} בוטלה",
          placeholders: { שם: client.name, תאריך: dateStr, שעה: timeStr },
          settingKey: "sendCancellationSMS",
          sessionId: id,
          clientId: existingSession.clientId || undefined,
          type: "CANCELLATION_BY_THERAPIST",
        });
      }
    }

    return NextResponse.json({
      message: "הפגישה בוטלה בהצלחה",
      cancelled: true,
      withinChargeWindow,
      isPast,
    });
  } catch (error) {
    logger.error("Cancel session error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בביטול הפגישה" },
      { status: 500 }
    );
  }
}
