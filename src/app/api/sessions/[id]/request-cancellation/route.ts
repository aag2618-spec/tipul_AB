import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import {
  createCancellationRequestToClientEmail,
  createCancellationRequestToTherapistEmail,
  formatSessionDateTime,
} from "@/lib/email-templates";

// POST /api/sessions/[id]/request-cancellation
// Allows a client to request cancellation of a session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();
    const { reason, clientId } = body;

    if (!clientId) {
      return NextResponse.json(
        { success: false, message: "מזהה מטופל חסר" },
        { status: 400 }
      );
    }

    // Get the session with client and thexxxxxx xxxx
    const therapySession = await prisma.therapySession.findUnique({
      where: { id: sessionId },
      include: {
        client: true,
        therapist: true,
      },
    });

    if (!therapySession) {
      return NextResponse.json(
        { success: false, message: "הפגישה לא נמצאה" },
        { status: 404 }
      );
    }

    // Verify the session belongs to this client
    if (therapySession.clientId !== clientId) {
      return NextResponse.json(
        { success: false, message: "אין הרשאה לבטל פגישה זו" },
        { status: 403 }
      );
    }

    // Check if session is already cancelled or pending cancellation
    if (therapySession.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, message: "הפגישה כבר מבוטלת" },
        { status: 400 }
      );
    }

    if (therapySession.status === "PENDING_CANCELLATION") {
      return NextResponse.json(
        { success: false, message: "כבר קיימת בקשת ביטול ממתינה לפגישה זו" },
        { status: 400 }
      );
    }

    // Get thexxxxxx'x communication settings
    const commSettings = await prisma.communicationSetting.findUnique({
      where: { userId: therapySession.therapistId },
    });

    const minHours = commSettings?.minCancellationHours ?? 24;
    const hoursUntilSession = 
      (new Date(therapySession.startTime).getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilSession < minHours) {
      return NextResponse.json(
        { 
          success: false, 
          message: `לא ניתן לבטל פחות מ-${minHours} שעות לפני הפגישה` 
        },
        { status: 400 }
      );
    }

    // Check if client cancellation is allowed
    if (commSettings && !commSettings.allowClientCancellation) {
      return NextResponse.json(
        { success: false, message: "ביטול תורים על ידי מטופלים אינו זמין. נא ליצור קשר ישירות" },
        { status: 400 }
      );
    }

    // Create cancellation request
    const cancellationRequest = await prisma.cancellationRequest.create({
      data: {
        sessionId,
        clientId,
        reason: reason || null,
        status: "PENDING",
      },
    });

    // Update session status
    await prisma.therapySession.update({
      where: { id: sessionId },
      data: {
        status: "PENDING_CANCELLATION",
        cancellationReason: reason || null,
        cancellationRequestedAt: new Date(),
      },
    });

    // Create notification for therapist
    await prisma.notification.create({
      data: {
        userId: therapySession.therapistId,
        type: "CANCELLATION_REQUEST",
        title: `בקשת ביטול מ${therapySession.client.name}`,
        content: reason ? `סיבה: ${reason}` : "לא צוינה סיבה",
        status: "PENDING",
      },
    });

    const { date, time } = formatSessionDateTime(therapySession.startTime);
    const therapistName = therapySession.therapist.name || "המטפל/ת שלך";

    // Send email to client (confirmation)
    if (therapySession.client.email) {
      const clientEmail = createCancellationRequestToClientEmail({
        clientName: therapySession.client.name,
        therapistName,
        date,
        time,
      });

      const clientResult = await sendEmail({
        to: therapySession.client.email,
        subject: clientEmail.subject,
        html: clientEmail.html,
        replyTo: therapySession.therapist.email || undefined, // תשובות יגיעו למטפל
      });

      // Log communication
      await prisma.communicationLog.create({
        data: {
          type: "CANCELLATION_REQUEST_TO_CLIENT",
          channel: "EMAIL",
          recipient: therapySession.client.email,
          subject: clientEmail.subject,
          content: clientEmail.html,
          status: clientResult.success ? "SENT" : "FAILED",
          errorMessage: clientResult.success ? null : String(clientResult.error),
          sentAt: clientResult.success ? new Date() : null,
          sessionId,
          clientId,
          userId: therapySession.therapistId,
        },
      });
    }

    // Send email to therapist (notification)
    if (therapySession.therapist.email) {
      const dashboardLink = `${process.env.NEXTAUTH_URL}/dashboard/cancellation-requests`;
      const therapistEmail = createCancellationRequestToTherapistEmail({
        clientName: therapySession.client.name,
        therapistName,
        date,
        time,
        reason: reason || undefined,
        dashboardLink,
      });

      const therapistResult = await sendEmail({
        to: therapySession.therapist.email,
        subject: therapistEmail.subject,
        html: therapistEmail.html,
        replyTo: therapySession.client.email || undefined, // תשובות יגיעו ללקוח
      });

      // Log communication
      await prisma.communicationLog.create({
        data: {
          type: "CANCELLATION_REQUEST_TO_THERAPIST",
          channel: "EMAIL",
          recipient: therapySession.therapist.email,
          subject: therapistEmail.subject,
          content: therapistEmail.html,
          status: therapistResult.success ? "SENT" : "FAILED",
          errorMessage: therapistResult.success ? null : String(therapistResult.error),
          sentAt: therapistResult.success ? new Date() : null,
          sessionId,
          clientId,
          userId: therapySession.therapistId,
        },
      });

      // Create notification for therapist
      await prisma.notification.create({
        data: {
          userId: therapySession.therapistId,
          type: "CUSTOM",
          title: `בקשת ביטול חדשה מ${therapySession.client.name}`,
          content: `${therapySession.client.name} ביקש/ה לבטל את הפגישה ב-${date} בשעה ${time}. ${reason ? `סיבה: ${reason}` : ''}`,
          status: "PENDING",
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "בקשת הביטול נשלחה בהצלחה. המטפל/ת יבדוק את הבקשה ויעדכן אותך בהקדם.",
      requestId: cancellationRequest.id,
    });
  } catch (error) {
    console.error("Request cancellation error:", error);
    return NextResponse.json(
      { success: false, message: "אירעה שגיאה בשליחת בקשת הביטול" },
      { status: 500 }
    );
  }
}
