import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { createSessionConfirmationEmail, formatSessionDateTime } from "@/lib/email-templates";

// Send session confirmation email immediately after session creation
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { message: "sessionId is required" },
        { status: 400 }
      );
    }

    // Fetch session with client and therapist
    const therapySession = await prisma.therapySession.findFirst({
      where: {
        id: sessionId,
        therapistId: session.user.id,
      },
      include: {
        client: true,
        therapist: {
          include: {
            communicationSetting: true,
          },
        },
      },
    });

    if (!therapySession) {
      return NextResponse.json(
        { message: "Session not found" },
        { status: 404 }
      );
    }

    // Skip if client is null (BREAK session) or has no email
    if (!therapySession.client || !therapySession.client.email) {
      return NextResponse.json({
        message: "Client has no email",
        success: false,
      });
    }

    // Check if therapist has confirmation emails enabled
    const settings = therapySession.therapist.communicationSetting;
    if (settings && !settings.sendConfirmationEmail) {
      return NextResponse.json({
        message: "Confirmation emails are disabled",
        success: false,
      });
    }

    // Check if we already sent confirmation for this session
    const existingLog = await prisma.communicationLog.findFirst({
      where: {
        sessionId: therapySession.id,
        type: "SESSION_CONFIRMATION",
      },
    });

    if (existingLog) {
      return NextResponse.json({
        message: "Confirmation already sent",
        success: false,
      });
    }

    const { date, time } = formatSessionDateTime(therapySession.startTime);
    const { subject, html } = createSessionConfirmationEmail({
      clientName: therapySession.client.name,
      therapistName: therapySession.therapist.name || "המטפל/ת שלך",
      date,
      time,
      address: therapySession.location || undefined,
    });

    const result = await sendEmail({
      to: therapySession.client.email,
      subject,
      html,
      replyTo: therapySession.therapist.email || undefined,
    });

    // Log communication
    await prisma.communicationLog.create({
      data: {
        type: "SESSION_CONFIRMATION",
        channel: "EMAIL",
        recipient: therapySession.client.email,
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

    if (result.success) {
      return NextResponse.json({
        message: "Confirmation email sent successfully",
        success: true,
      });
    } else {
      return NextResponse.json(
        {
          message: "Failed to send confirmation email",
          error: result.error,
          success: false,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Send confirmation error:", error);
    return NextResponse.json(
      { message: "Error sending confirmation", success: false },
      { status: 500 }
    );
  }
}
