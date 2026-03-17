import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// Webhook to receive incoming emails forwarded from Gmail/Outlook
export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.INCOMING_EMAIL_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ message: "INCOMING_EMAIL_SECRET not configured" }, { status: 503 });
    }
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${webhookSecret}`) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    
    // Extract email data
    const {
      from,
      to,
      subject,
      text,
      html,
      originalMessageId,
    } = body;

    if (!from || !subject) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Find the client by email
    const senderEmail = from.toLowerCase().trim();
    const client = await prisma.client.findFirst({
      where: {
        email: {
          equals: senderEmail,
          mode: 'insensitive'
        }
      },
      include: {
        therapist: true,
      }
    });

    if (!client) {
      logger.info(`No client found for email: ${senderEmail}`);
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

    // Duplicate detection
    if (originalMessageId) {
      const existing = await prisma.communicationLog.findFirst({
        where: { messageId: originalMessageId },
      });
      if (existing) {
        logger.info("Duplicate incoming email, skipping:", { data: originalMessageId });
        return NextResponse.json({ message: "Duplicate, already processed" });
      }
    }

    // Normalize subject — don't add RE: if already present
    const normalizedSubject = /^(Re:|RE:|השב:|הע:|Fwd:|FWD:)\s*/i.test(subject)
      ? subject
      : `RE: ${subject}`;

    // Create incoming email log
    const incomingLog = await prisma.communicationLog.create({
      data: {
        type: "INCOMING_EMAIL",
        channel: "EMAIL",
        recipient: to || "inbox@mytipul.com",
        subject: normalizedSubject,
        content: html || text || "",
        status: "RECEIVED",
        sentAt: new Date(),
        messageId: originalMessageId || null,
        clientId: client.id,
        userId: client.therapistId,
      },
    });

    // Create notification for therapist
    await prisma.notification.create({
      data: {
        userId: client.therapistId,
        type: "EMAIL_RECEIVED",
        title: `📬 תגובה מ-${client.name}`,
        content: `נושא: ${subject}`,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      success: true,
      logId: incomingLog.id,
      message: "Incoming email logged successfully"
    });
  } catch (error) {
    logger.error("Incoming email error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Error processing incoming email" },
      { status: 500 }
    );
  }
}

// Simple endpoint to manually log an incoming email
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { communicationLogId, replyContent, replySubject } = await request.json();

    if (!communicationLogId) {
      return NextResponse.json(
        { message: "חסר מזהה תקשורת" },
        { status: 400 }
      );
    }

    // Get original log
    const originalLog = await prisma.communicationLog.findUnique({
      where: { id: communicationLogId },
      include: {
        client: true,
      }
    });

    if (!originalLog || originalLog.userId !== userId) {
      return NextResponse.json({ message: "לא נמצא" }, { status: 404 });
    }

    // Create reply log — recipient = inbox (consistent with webhook-created incoming emails)
    const replyLog = await prisma.communicationLog.create({
      data: {
        type: "INCOMING_EMAIL",
        channel: "EMAIL",
        recipient: "inbox@mytipul.com",
        subject: replySubject || (originalLog.subject?.match(/^(Re:|RE:|השב:|הע:)/i) ? originalLog.subject : `RE: ${originalLog.subject}`),
        content: replyContent || "המטופל השיב על המייל",
        status: "RECEIVED",
        sentAt: new Date(),
        clientId: originalLog.clientId,
        userId: userId,
      },
    });

    return NextResponse.json({
      success: true,
      logId: replyLog.id,
      message: "התגובה נרשמה בהצלחה"
    });
  } catch (error) {
    logger.error("Manual reply log error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ברישום התגובה" },
      { status: 500 }
    );
  }
}
