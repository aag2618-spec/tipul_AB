import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import {
  createCancellationRejectedEmail,
  formatSessionDateTime,
} from "@/lib/email-templates";

// POST /api/cancellation-requests/[id]/reject
// Reject a cancellation request
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id: requestId } = await params;
    const body = await request.json();
    const { reason, adminNotes } = body;

    if (!reason) {
      return NextResponse.json(
        { success: false, message: "נא לציין סיבת דחייה" },
        { status: 400 }
      );
    }

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
        client: true,
      },
    });

    if (!cancellationRequest) {
      return NextResponse.json(
        { success: false, message: "בקשת הביטול לא נמצאה" },
        { status: 404 }
      );
    }

    // Verify the therapist owns this session
    if (cancellationRequest.session.therapistId !== session.user.id) {
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
        status: "REJECTED",
        adminNotes: adminNotes || reason,
        reviewedAt: new Date(),
        reviewedById: session.user.id,
      },
    });

    // Restore session status to SCHEDULED
    await prisma.therapySession.update({
      where: { id: cancellationRequest.sessionId },
      data: {
        status: "SCHEDULED",
        cancellationReason: null,
        cancellationRequestedAt: null,
      },
    });

    const { date, time } = formatSessionDateTime(cancellationRequest.session.startTime);
    const therapistName = cancellationRequest.session.therapist.name || "המטפל/ת שלך";

    // Send rejection email to client
    if (cancellationRequest.client.email) {
      const rejectionEmail = createCancellationRejectedEmail({
        clientName: cancellationRequest.client.name,
        therapistName,
        date,
        time,
        rejectionReason: reason,
      });

      const result = await sendEmail({
        to: cancellationRequest.client.email,
        subject: rejectionEmail.subject,
        html: rejectionEmail.html,
        replyTo: cancellationRequest.session.therapist.email || undefined, // תשובות יגיעו למטפל
      });

      // Log communication
      await prisma.communicationLog.create({
        data: {
          type: "CANCELLATION_REJECTED",
          channel: "EMAIL",
          recipient: cancellationRequest.client.email,
          subject: rejectionEmail.subject,
          content: rejectionEmail.html,
          status: result.success ? "SENT" : "FAILED",
          errorMessage: result.success ? null : String(result.error),
          sentAt: result.success ? new Date() : null,
          sessionId: cancellationRequest.sessionId,
          clientId: cancellationRequest.clientId,
          userId: session.user.id,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "הבקשה נדחתה והמטופל/ת קיבל/ה עדכון",
    });
  } catch (error) {
    console.error("Reject cancellation error:", error);
    return NextResponse.json(
      { success: false, message: "אירעה שגיאה בדחיית הבקשה" },
      { status: 500 }
    );
  }
}
