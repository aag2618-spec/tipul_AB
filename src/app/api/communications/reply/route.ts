import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import path from "path";
import fs from "fs/promises";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    let communicationLogId: string;
    let replyContent: string;
    const resendAttachments: { filename: string; content: Buffer }[] = [];

    // Check if request is FormData (with attachments) or JSON
    const contentType = request.headers.get("content-type") || "";
    
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      communicationLogId = formData.get("communicationLogId") as string;
      replyContent = formData.get("replyContent") as string;
      
      // Process file attachments
      const files = formData.getAll("attachments") as File[];
      for (const file of files) {
        if (file && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          resendAttachments.push({
            filename: file.name,
            content: buffer,
          });
        }
      }
    } else {
      const body = await request.json();
      communicationLogId = body.communicationLogId;
      replyContent = body.replyContent;
    }

    if (!communicationLogId || !replyContent) {
      return NextResponse.json(
        { message: "חסרים שדות חובה" },
        { status: 400 }
      );
    }

    // Get the original email
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

    // Get therapist info
    const therapist = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    });

    // Build reply subject — handle Hebrew prefixes too
    const replySubject = /^(Re:|RE:|השב:|הע:|Fwd:|FWD:)\s*/i.test(originalLog.subject || "")
      ? originalLog.subject
      : `Re: ${originalLog.subject || "ללא נושא"}`;

    // Escape user content to prevent XSS
    const escapeHtml = (str: string) =>
      str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const safeReplyContent = escapeHtml(replyContent);
    const safeTherapistName = escapeHtml(therapist?.name || "המטפל/ת שלך");

    const attachmentNote = resendAttachments.length > 0
      ? `<p style="color: #888; font-size: 12px; margin-top: 10px;">📎 ${resendAttachments.length} קבצים מצורפים</p>`
      : "";

    const replyHtml = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="white-space: pre-wrap; line-height: 1.6;">${safeReplyContent}</div>
        ${attachmentNote}
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          בברכה,<br/>
          ${safeTherapistName}
        </p>
      </div>
    `;

    // Build threading headers
    const emailHeaders: Record<string, string> = {};
    if (originalLog.messageId) {
      emailHeaders["In-Reply-To"] = originalLog.messageId;
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
      ...(resendAttachments.length > 0 && { attachments: resendAttachments }),
    });

    if (sendError) {
      console.error("Reply send error:", sendError);
      return NextResponse.json(
        { message: `שגיאה בשליחה: ${sendError.message}` },
        { status: 500 }
      );
    }

    // Save attachment copies to disk + build metadata
    const sentAttachmentMeta: Array<{
      filename: string;
      size: number;
      resendEmailId: string | null;
      fileUrl: string;
    }> = [];

    if (resendAttachments.length > 0 && originalLog.clientId) {
      const uploadsDir = process.env.UPLOADS_DIR || "/var/data/uploads";
      const sentDir = path.join(uploadsDir, "sent", originalLog.clientId);
      await fs.mkdir(sentDir, { recursive: true });

      for (const att of resendAttachments) {
        const safeFilename = att.filename.replace(/[^a-zA-Z0-9._\u0590-\u05FF -]/g, "_");
        const uniqueFilename = `${Date.now()}_${safeFilename}`;
        const filePath = path.join(sentDir, uniqueFilename);
        await fs.writeFile(filePath, att.content);

        sentAttachmentMeta.push({
          filename: att.filename,
          size: att.content.length,
          resendEmailId: sendResult?.id || null,
          fileUrl: `/api/uploads/sent/${originalLog.clientId}/${uniqueFilename}`,
        });
      }
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
        ...(sentAttachmentMeta.length > 0 && { attachments: sentAttachmentMeta }),
      },
    });

    // Mark the original incoming email as read
    if (originalLog.type === "INCOMING_EMAIL") {
      await prisma.communicationLog.update({
        where: { id: communicationLogId },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
    }

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
