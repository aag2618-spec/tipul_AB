import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { parseIsraelTime } from "@/lib/date-utils";
import { parseBody } from "@/lib/validations/helpers";
import { createSessionSchema } from "@/lib/validations/session";
import { logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { syncSessionToGoogleCalendar } from "@/lib/google-calendar-sync";
import { buildClientWhere, buildSessionWhere, loadScopeUser } from "@/lib/scope";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const scopeUser = await loadScopeUser(userId);
    const scopeWhere = buildSessionWhere(scopeUser);

    const extraConditions: Prisma.TherapySessionWhereInput = {};
    if (clientId) {
      extraConditions.clientId = clientId;
    }

    // Overlap with [startDate, endDate]: include any session that isn't entirely before/after the window.
    // (Filtering only by startTime in range misses sessions that start before the window but overlap it.)
    if (startDate && endDate) {
      const rangeStart = parseIsraelTime(startDate);
      const rangeEnd = parseIsraelTime(endDate);
      extraConditions.AND = [
        { startTime: { lt: rangeEnd } },
        { endTime: { gt: rangeStart } },
      ];
    }

    const where: Prisma.TherapySessionWhereInput = {
      AND: [scopeWhere, extraConditions],
    };

    const sessions = await prisma.therapySession.findMany({
      where,
      orderBy: { startTime: "asc" },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true, creditBalance: true, defaultSessionPrice: true, isQuickClient: true },
        },
        sessionNote: true,
        payment: true,
      },
    });

    return NextResponse.json(serializePrisma(sessions));
  } catch (error) {
    logger.error("Get sessions error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הפגישות" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const parsed = await parseBody(request, createSessionSchema);
    if ("error" in parsed) return parsed.error;
    const { clientId, startTime, endTime, type, price, location, notes, topic, isRecurring, allowOverlap } = parsed.data;

    const scopeUser = await loadScopeUser(userId);
    const clientScopeWhere = buildClientWhere(scopeUser);

    // Verify client belongs to therapist / clinic scope (skip for BREAK)
    let clientDefaultPrice = 0;
    if (type !== "BREAK") {
      const client = await prisma.client.findFirst({
        where: { AND: [{ id: clientId }, clientScopeWhere] },
      });

      if (!client) {
        return NextResponse.json(
          { message: "מטופל לא נמצא" },
          { status: 404 }
        );
      }

      // Use client's default session price if no price provided
      clientDefaultPrice = Number(client.defaultSessionPrice || 0);

      // אם גם למטופל אין מחיר, ניקח את מחיר ברירת המחדל של המטפל
      if (clientDefaultPrice === 0) {
        const therapist = await prisma.user.findUnique({
          where: { id: userId },
          select: { defaultSessionPrice: true },
        });
        if (therapist?.defaultSessionPrice) {
          clientDefaultPrice = Number(therapist.defaultSessionPrice);
        }
      }
    }

    // Parse times using Israel timezone
    const parsedStartTime = parseIsraelTime(startTime);
    const parsedEndTime = parseIsraelTime(endTime);

    // Sanity guard against malformed input that would silently corrupt the
    // calendar — e.g. swapped start/end (a 20-hour ghost session that blocks
    // every slot), or absurd durations from a buggy client.
    if (parsedEndTime.getTime() <= parsedStartTime.getTime()) {
      return NextResponse.json(
        { message: "שעת הסיום חייבת להיות אחרי שעת ההתחלה" },
        { status: 400 }
      );
    }
    const durationMs = parsedEndTime.getTime() - parsedStartTime.getTime();
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    if (durationMs > TWELVE_HOURS_MS) {
      return NextResponse.json(
        { message: "משך פגישה לא יכול לעלות על 12 שעות" },
        { status: 400 }
      );
    }

    // Check for conflicts
    const conflict = await prisma.therapySession.findFirst({
      where: {
        therapistId: userId,
        status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
        OR: [
          {
            AND: [
              { startTime: { lte: parsedStartTime } },
              { endTime: { gt: parsedStartTime } },
            ],
          },
          {
            AND: [
              { startTime: { lt: parsedEndTime } },
              { endTime: { gte: parsedEndTime } },
            ],
          },
          {
            AND: [
              { startTime: { gte: parsedStartTime } },
              { endTime: { lte: parsedEndTime } },
            ],
          },
        ],
      },
      include: {
        client: { select: { name: true } },
      },
    });

    if (conflict && !allowOverlap) {
      const statusLabels: Record<string, string> = {
        SCHEDULED: "מתוכננת",
        PENDING_APPROVAL: "ממתינה לאישור",
        COMPLETED: "הושלמה",
        CANCELLED: "בוטלה",
        NO_SHOW: "אי הופעה",
      };
      const conflictName = conflict.client?.name || (conflict.type === "BREAK" ? "הפסקה" : "פגישה");
      const conflictStart = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(conflict.startTime);
      const conflictEnd = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(conflict.endTime);
      const statusHeb = statusLabels[conflict.status] || conflict.status;
      return NextResponse.json(
        { message: `יש התנגשות עם פגישה קיימת: ${conflictName} (${conflictStart}-${conflictEnd}), סטטוס: ${statusHeb}` },
        { status: 400 }
      );
    }

    const therapySession = await prisma.therapySession.create({
      data: {
        therapistId: userId,
        organizationId: scopeUser.organizationId,
        clientId: type === "BREAK" ? null : clientId,
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        type: type ?? "IN_PERSON",
        price: type === "BREAK" ? 0 : (price || clientDefaultPrice),
        topic: topic || null,
        location: location || null,
        notes: notes || null,
        isRecurring: isRecurring || false,
      },
      include: {
        client: {
          select: { id: true, name: true, email: true },
        },
        therapist: {
          include: {
            communicationSetting: true,
          },
        },
      },
    });

    // Sync to Google Calendar (non-blocking)
    syncSessionToGoogleCalendar(userId, {
      id: therapySession.id,
      clientName: therapySession.client?.name || null,
      type: therapySession.type,
      startTime: therapySession.startTime,
      endTime: therapySession.endTime,
      location: therapySession.location,
      topic: therapySession.topic,
    }).catch((err) => logger.error("[GoogleCalendarSync] Error:", { error: err instanceof Error ? err.message : String(err) }));

    // Send confirmation email (skip for BREAK and if client has no email)
    if (type !== "BREAK" && therapySession.client?.email) {
      // Check if therapist has confirmation emails enabled
      const settings = therapySession.therapist.communicationSetting;
      if (!settings || settings.sendConfirmationEmail) {
        // Send email directly without HTTP request
        const { sendEmail } = await import("@/lib/resend");
        const { createSessionConfirmationEmail, formatSessionDateTime } = await import("@/lib/email-templates");

        // Format session date/time for confirmation email
        const { date, time } = formatSessionDateTime(therapySession.startTime);
        // Store email in variable for type safety
        const clientEmail = therapySession.client.email;
        const { subject, html } = createSessionConfirmationEmail({
          clientName: therapySession.client.name,
          therapistName: therapySession.therapist.name || "המטפל/ת שלך",
          date,
          time,
          address: therapySession.location || undefined,
          customization: settings ? {
            customGreeting: settings.customGreeting,
            customClosing: settings.customClosing,
            emailSignature: settings.emailSignature,
            businessHours: settings.businessHours,
          } : null,
        });

        // Send email asynchronously
        sendEmail({
          to: clientEmail,
          subject,
          html,
        })
          .then(async (result) => {
            // Log communication
            await prisma.communicationLog.create({
              data: {
                type: "SESSION_CONFIRMATION",
                channel: "EMAIL",
                recipient: clientEmail,
                subject,
                content: html,
                status: result.success ? "SENT" : "FAILED",
                errorMessage: result.success ? null : String(result.error),
                sentAt: result.success ? new Date() : null,
                sessionId: therapySession.id,
                clientId: therapySession.clientId,
                userId: therapySession.therapistId,
                messageId: result.messageId,
              },
            });

            // Log result
            if (result.success) {
              logger.info(`Confirmation email sent to ${clientEmail}`);
            } else {
              logger.error(`Failed to send confirmation to ${clientEmail}:`, { error: result.error });
            }
          })
          .catch((err) => logger.error("Failed to send confirmation:", { error: err instanceof Error ? err.message : String(err) }));
      }
    }

    // WRITE_SUMMARY tasks removed - summary tracking is done via sessionNote IS NULL
    // on TherapySession directly (single source of truth)

    // Return session without therapist data (clean response)
    return NextResponse.json(serializePrisma({
      ...therapySession,
      therapist: undefined,
    }), { status: 201 });
  } catch (error) {
    logger.error("Create session error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הפגישה" },
      { status: 500 }
    );
  }
}
