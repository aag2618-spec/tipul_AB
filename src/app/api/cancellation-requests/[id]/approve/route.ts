import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import {
  createCancellationApprovedEmail,
  formatSessionDateTime,
} from "@/lib/email-templates";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { checkRateLimit, EMAIL_SEND_USER_RATE_LIMIT } from "@/lib/rate-limit";
import { loadScopeUser, buildSessionWhere } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { parseBody } from "@/lib/validations/helpers";
import { approveCancellationSchema } from "@/lib/validations/misc";

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
    const { userId } = auth;

    // Stage 2.0 — rate limit לפי userId על פעולת אישור (שולחת מייל ללקוח).
    const rateLimitResult = checkRateLimit(
      `cancellation-approve:${userId}`,
      EMAIL_SEND_USER_RATE_LIMIT
    );
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { message: "הגעת למכסת השליחה השעתית. נסה שוב בעוד שעה." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(1, Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000))
            ),
          },
        }
      );
    }

    const { id: requestId } = await params;
    const parsed = await parseBody(request, approveCancellationSchema);
    if ("error" in parsed) return parsed.error;
    const { adminNotes } = parsed.data;

    // H1: scope-based ownership — מאפשר CLINIC_OWNER לאשר ביטולים של צוות.
    const scopeUser = await loadScopeUserWithMode(userId);
    const cancellationRequest = await prisma.cancellationRequest.findFirst({
      where: {
        AND: [{ id: requestId }, { session: buildSessionWhere(scopeUser) }],
      },
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
      // 404 אחיד — מונע enumeration.
      return NextResponse.json(
        { success: false, message: "בקשת הביטול לא נמצאה" },
        { status: 404 }
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
