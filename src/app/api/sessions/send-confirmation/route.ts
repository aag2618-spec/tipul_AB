import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { createSessionConfirmationEmail, formatSessionDateTime } from "@/lib/email-templates";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { buildSessionWhere, isSecretary, secretaryCan } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { checkRateLimit, EMAIL_SEND_USER_RATE_LIMIT } from "@/lib/rate-limit";

// Send session confirmation email immediately after session creation
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId, session } = auth;

  try {
    // Stage 2.0 — rate limit לפי userId: 30 אישורי פגישה/שעה.
    const rateLimitResult = checkRateLimit(
      `send-confirmation:${userId}`,
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

    const { sessionId } = await request.json();

    if (!sessionId || typeof sessionId !== "string" || sessionId.length > 100) {
      return NextResponse.json(
        { message: "sessionId לא תקין" },
        { status: 400 }
      );
    }

    const scopeUser = await loadScopeUserWithMode(userId);

    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canSendReminders")) {
      return NextResponse.json(
        { message: "אין הרשאה לשליחת אישורים" },
        { status: 403 }
      );
    }

    const sessionScopeWhere = buildSessionWhere(scopeUser);

    // Fetch session with client and therapist
    const therapySession = await prisma.therapySession.findFirst({
      where: { AND: [{ id: sessionId }, sessionScopeWhere] },
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

    // ⭐ סינון SENT + EMAIL בלבד — log של FAILED (למשל מנסיון בשבת) לא חוסם retry,
    //    ו-SMS SENT לא חוסם retry של EMAIL (dedup נפרד לכל ערוץ)
    const existingLog = await prisma.communicationLog.findFirst({
      where: {
        sessionId: therapySession.id,
        type: "SESSION_CONFIRMATION",
        channel: "EMAIL",
        status: "SENT",
      },
    });

    if (existingLog) {
      return NextResponse.json({
        message: "Confirmation already sent",
        success: false,
      });
    }

    // קישור "הפגישות שלי" לביטול ע"י המטופל — רק אם ביטול-מטופל מאופשר.
    let manageUrl: string | undefined;
    const allowCancel = settings ? settings.allowClientCancellation : true;
    if (allowCancel && therapySession.clientId) {
      const { ensureManageLinkToken, buildManageUrl } = await import("@/lib/appointment-manage-link");
      const mtoken = await ensureManageLinkToken({
        id: therapySession.clientId,
        email: therapySession.client.email,
        phone: therapySession.client.phone ?? null,
        therapistId: therapySession.therapistId,
        organizationId: therapySession.organizationId ?? null,
      });
      if (mtoken) manageUrl = buildManageUrl(mtoken);
    }

    const { date, time } = formatSessionDateTime(therapySession.startTime);
    const { subject, html } = createSessionConfirmationEmail({
      clientName: therapySession.client.name,
      therapistName: therapySession.therapist.name || "המטפל/ת שלך",
      date,
      time,
      address: therapySession.location || undefined,
      manageUrl,
      customization: settings ? {
        customGreeting: settings.customGreeting,
        customClosing: settings.customClosing,
        emailSignature: settings.emailSignature,
        businessHours: settings.businessHours,
      } : null,
    });

    const result = await sendEmail({
      to: therapySession.client.email,
      subject,
      html,
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
    } else if (result.shabbatBlocked) {
      // חסום בשבת/חג — מחזירים 200 עם הודעה ברורה (לא 500, כי זו לא תקלה)
      return NextResponse.json({
        message: "אישור לא נשלח — שבת/חג. ניתן לשלוח מחדש במוצאי שבת/חג.",
        success: false,
        shabbatBlocked: true,
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
    logger.error("Send confirmation error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Error sending confirmation", success: false },
      { status: 500 }
    );
  }
}
