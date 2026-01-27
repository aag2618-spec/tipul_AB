import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Webhook to receive incoming emails forwarded from Gmail/Outlook
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const authHeader = request.headers.get("authorization");
    const webhookSecret = process.env.INCOMING_EMAIL_SECRET;
    
    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
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
    const client = await prisma.client.findFirst({
      where: {
        email: {
          contains: from,
          mode: 'insensitive'
        }
      },
      include: {
        therapist: true,
      }
    });

    if (!client) {
      console.log(`No client found for email: ${from}`);
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

    // Find original communication log if exists (by matching subject or recent emails)
    const recentLog = await prisma.communicationLog.findFirst({
      where: {
        clientId: client.id,
        channel: "EMAIL",
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Create incoming email log
    const incomingLog = await prisma.communicationLog.create({
      data: {
        type: "INCOMING_EMAIL",
        channel: "EMAIL",
        recipient: from,
        subject: `RE: ${subject}`,
        content: html || text || "",
        status: "RECEIVED",
        sentAt: new Date(),
        clientId: client.id,
        userId: client.therapistId,
      },
    });

    // Create notification for therapist
    await prisma.notification.create({
      data: {
        userId: client.therapistId,
        type: "EMAIL_SENT",
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
    console.error("Incoming email error:", error);
    return NextResponse.json(
      { message: "Error processing incoming email" },
      { status: 500 }
    );
  }
}

// Simple endpoint to manually log an incoming email
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

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

    if (!originalLog || originalLog.userId !== session.user.id) {
      return NextResponse.json({ message: "לא נמצא" }, { status: 404 });
    }

    // Create reply log
    const replyLog = await prisma.communicationLog.create({
      data: {
        type: "INCOMING_EMAIL",
        channel: "EMAIL",
        recipient: originalLog.recipient,
        subject: replySubject || `RE: ${originalLog.subject}`,
        content: replyContent || "המטופל השיב על המייל",
        status: "RECEIVED",
        sentAt: new Date(),
        clientId: originalLog.clientId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      logId: replyLog.id,
      message: "התגובה נרשמה בהצלחה"
    });
  } catch (error) {
    console.error("Manual reply log error:", error);
    return NextResponse.json(
      { message: "שגיאה ברישום התגובה" },
      { status: 500 }
    );
  }
}
