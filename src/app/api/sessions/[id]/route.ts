import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { parseIsraelTime } from "@/lib/date-utils";
import { createPaymentForSession } from "@/lib/payment-service";
import { logger } from "@/lib/logger";

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

    return NextResponse.json(therapySession);
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
    const { startTime, endTime, type, price, location, notes, status, createPayment, markAsPaid } = body;

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

    const therapySession = await prisma.therapySession.update({
      where: { id },
      data: {
        startTime: startTime ? parseIsraelTime(startTime) : undefined,
        endTime: endTime ? parseIsraelTime(endTime) : undefined,
        type: type || undefined,
        price: finalPrice,
        location: location !== undefined ? location : undefined,
        notes: notes !== undefined ? notes : undefined,
        status: status || undefined,
      },
      include: {
        client: true,
        sessionNote: true,
      },
    });

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
        await createPaymentForSession({
          userId,
          clientId: therapySession.clientId,
          sessionId: therapySession.id,
          amount: markAsPaid ? Number(therapySession.price) : 0,
          expectedAmount: Number(therapySession.price),
          method: "CASH",
          paymentType: "FULL",
        });
      }
    }

    // Fetch updated session with payment info
    const updatedSession = await prisma.therapySession.findUnique({
      where: { id: therapySession.id },
      include: {
        client: true,
        payment: true,
      },
    });

    return NextResponse.json(updatedSession);
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

    // If skipSummary is set to true, also complete the WRITE_SUMMARY task
    if (skipSummary === true) {
      await prisma.task.updateMany({
        where: {
          userId,
          type: "WRITE_SUMMARY",
          status: { in: ["PENDING", "IN_PROGRESS"] },
          description: { contains: id },
        },
        data: { status: "COMPLETED" },
      });
    }

    return NextResponse.json(updatedSession);
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

    // Complete any WRITE_SUMMARY task for this session
    await prisma.task.updateMany({
      where: {
        userId,
        type: "WRITE_SUMMARY",
        status: { in: ["PENDING", "IN_PROGRESS"] },
        description: { contains: id },
      },
      data: { status: "COMPLETED" },
    });

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
