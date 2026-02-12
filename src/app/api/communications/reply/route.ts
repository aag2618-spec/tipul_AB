import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Resend } from "resend";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { communicationLogId, replyContent } = await request.json();

    if (!communicationLogId || !replyContent) {
      return NextResponse.json(
        { message: "חסרים שדות חובה" },
        { status: 400 }
      );
    }

    // Get the original incoming email
    const originalLog = await prisma.communicationLog.findUnique({
      where: { id: communicationLogId },
      include: {
        client: true,
      },
    });

    if (!originalLog || originalLog.userId !== session.user.id) {
      return NextResponse.json({ message: "לא נמצא" }, { status: 404 });
    }

    if (!originalLog.client?.email) {
      return NextResponse.json(
        { message: "למטופל אין כתובת מייל" },
        { status: 400 }
      );
    }

    // Get therapist info for sender name
    const therapist = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    });

    // Build reply subject
    const replySubject = originalLog.subject?.startsWith("Re:")
      ? originalLog.subject
      : `Re: ${originalLog.subject || "ללא נושא"}`;

    // Build reply HTML
    const replyHtml = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="white-space: pre-wrap; line-height: 1.6;">${replyContent}</div>
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          בברכה,<br/>
          ${therapist?.name || "המטפל/ת שלך"}
        </p>
        <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;" />
        <div style="color: #999; font-size: 12px; margin-top: 10px;">
          <p><strong>בתשובה ל:</strong></p>
          <blockquote style="border-right: 3px solid #ddd; padding-right: 10px; margin-right: 0; color: #777;">
            ${originalLog.content?.substring(0, 500) || ""}
          </blockquote>
        </div>
      </div>
    `;

    // Build threading headers
    const emailHeaders: Record<string, string> = {};
    
    if (originalLog.messageId) {
      emailHeaders["In-Reply-To"] = originalLog.messageId;
      
      // Collect all previous message IDs for References header
      const previousRefs = originalLog.inReplyTo
        ? `${originalLog.inReplyTo} ${originalLog.messageId}`
        : originalLog.messageId;
      emailHeaders["References"] = previousRefs;
    }

    // Send reply via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json(
        { message: "מפתח API של Resend לא מוגדר" },
        { status: 500 }
      );
    }

    const resend = new Resend(resendApiKey);
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Tipul App <onboarding@resend.dev>",
      to: [originalLog.client.email.toLowerCase()],
      subject: replySubject,
      html: replyHtml,
      replyTo: "inbox@mytipul.com",
      headers: emailHeaders,
    });

    if (sendError) {
      console.error("Reply send error:", sendError);
      return NextResponse.json(
        { message: `שגיאה בשליחה: ${sendError.message}` },
        { status: 500 }
      );
    }

    // Log the reply in CommunicationLog
    const replyLog = await prisma.communicationLog.create({
      data: {
        type: "CUSTOM",
        channel: "EMAIL",
        recipient: originalLog.client.email,
        subject: replySubject,
        content: replyHtml,
        status: "SENT",
        sentAt: new Date(),
        messageId: sendResult?.id || null,
        inReplyTo: originalLog.messageId,
        clientId: originalLog.clientId,
        userId: session.user.id,
      },
    });

    // Mark the original incoming email as read
    await prisma.communicationLog.update({
      where: { id: communicationLogId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      logId: replyLog.id,
      message: "התשובה נשלחה בהצלחה",
    });
  } catch (error) {
    console.error("Reply error:", error);
    return NextResponse.json(
      { message: "שגיאה בשליחת התשובה" },
      { status: 500 }
    );
  }
}
