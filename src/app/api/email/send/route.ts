import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail, createGenericEmail } from "@/lib/resend";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const body = await request.json();
    const { clientId, subject, content } = body;

    if (!clientId || !subject || !content) {
      return NextResponse.json(
        { message: "נא למלא את כל השדות" },
        { status: 400 }
      );
    }

    // Get client and therapist info
    const client = await prisma.client.findFirst({
      where: { id: clientId, therapistId: userId },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    if (!client.email) {
      return NextResponse.json(
        { message: "למטופל אין כתובת מייל" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    const { subject: emailSubject, html } = createGenericEmail(
      client.name,
      subject,
      content,
      user?.name || "המטפל/ת שלך"
    );

    const result = await sendEmail({
      to: client.email.toLowerCase(), // המרה לאותיות קטנות
      subject: emailSubject,
      html,
    });

    // Log communication (both success and failure)
    const communicationLog = await prisma.communicationLog.create({
      data: {
        type: "CUSTOM",
        channel: "EMAIL",
        recipient: client.email.toLowerCase(),
        subject: emailSubject,
        content: html,
        status: result.success ? "SENT" : "FAILED",
        errorMessage: result.success ? null : String(result.error),
        sentAt: result.success ? new Date() : null,
        messageId: result.messageId, // Save Resend message ID for tracking replies
        clientId: client.id,
        userId: userId,
      },
    });

    if (!result.success) {
      logger.error("Email send failed:", { error: result.error });
      return NextResponse.json(
        { message: "שגיאה בשליחת המייל", error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      message: "המייל נשלח בהצלחה",
      logId: communicationLog.id
    });
  } catch (error) {
    logger.error("Send email error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בשליחת המייל" },
      { status: 500 }
    );
  }
}

