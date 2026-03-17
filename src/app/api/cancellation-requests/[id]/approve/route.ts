import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import {
  createCancellationApprovedEmail,
  formatSessionDateTime,
} from "@/lib/email-templates";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

// POST /api/cancellation-requests/[id]/approve
// Approve a cancellation request
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id: requestId } = await params;
    const body = await request.json().catch(() => ({}));
    const { adminNotes } = body;

    // Get the cancellation request
    const cancellationRequest = await prisma.cancellationRequest.findUnique({
      where: { id: requestId },
      include: {
        session: {
          include: {
            client: true,
            therapist: true,
          },
        },
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!cancellationRequest) {
      return NextResponse.json(
        { success: false, message: "בקשת הביטול לא נמצאה" },
        { status: 404 }
      );
    }

    // Verify the thexxxxxx owns this session
    if (cancellationRequest.session.therapistId !== userId) {
      return NextResponse.json(
        { success: false, message: "אין הרשאה לטפל בבקשה זו" },
        { status: 403 }
      );
    }

    if (cancellationRequest.status !== "PENDING") {
      return NextResponse.json(
        { success: false, message: "בקשה זו כבר טופלה" },
        { status: 400 }
      );
    }

    // Update cancellation request
    await prisma.cancellationRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        adminNotes: adminNotes || null,
        reviewedAt: new Date(),
        reviewedById: userId,
      },
    });

    // Update session status
    await prisma.therapySession.update({
      where: { id: cancellationRequest.sessionId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: "CLIENT",
      },
    });

    const { date, time } = formatSessionDateTime(cancellationRequest.session.startTime);
    const therapistName = cancellationRequest.session.therapist.name || "המטפל/ת שלך";

    // Send approval email to client
    if (cancellationRequest.client.email) {
      const approvalEmail = createCancellationApprovedEmail({
        clientName: `${cancellationRequest.client.firstName} ${cancellationRequest.client.lastName}`,
        therapistName,
        date,
        time,
      });

      const result = await sendEmail({
        to: cancellationRequest.client.email,
        subject: approvalEmail.subject,
        html: approvalEmail.html,
      });

      // Log communication
      await prisma.communicationLog.create({
        data: {
          type: "CANCELLATION_APPROVED",
          channel: "EMAIL",
          recipient: cancellationRequest.client.email,
          subject: approvalEmail.subject,
          content: approvalEmail.html,
          status: result.success ? "SENT" : "FAILED",
          errorMessage: result.success ? null : String(result.error),
          sentAt: result.success ? new Date() : null,
          messageId: result.messageId || null,
          sessionId: cancellationRequest.sessionId,
          clientId: cancellationRequest.clientId,
          userId: userId,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "הביטול אושר והמטופל/ת קיבל/ה עדכון",
    });
  } catch (error) {
    logger.error("Approve cancellation error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { success: false, message: "אירעה שגיאה באישור הביטול" },
      { status: 500 }
    );
  }
}
