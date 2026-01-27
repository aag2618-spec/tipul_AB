import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { headers } from "next/headers";

// Resend webhook for incoming email replies
export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature (optional but recommended)
    const headersList = await headers();
    const signature = headersList.get("svix-signature");
    
    const body = await request.json();
    console.log("Resend webhook received:", JSON.stringify(body, null, 2));

    // Handle different event types
    const { type, data } = body;

    if (type === "email.received" || type === "email.replied") {
      // Extract email data
      const {
        message_id,
        from,
        to,
        subject,
        html,
        text,
        in_reply_to,
        references,
      } = data;

      console.log("Processing incoming email:", {
        message_id,
        from,
        to,
        subject,
        in_reply_to,
      });

      // Find the original email this is replying to
      let originalEmail = null;
      if (in_reply_to) {
        originalEmail = await prisma.communicationLog.findFirst({
          where: { messageId: in_reply_to },
          include: {
            client: true,
            user: true,
          },
        });
      }

      // If we can't find by in_reply_to, try to match by client email
      if (!originalEmail) {
        // Extract email from "Name <email@example.com>" format
        const emailMatch = from.match(/<(.+?)>/) || [null, from];
        const senderEmail = emailMatch[1] || from;

        originalEmail = await prisma.communicationLog.findFirst({
          where: {
            recipient: {
              equals: senderEmail,
              mode: "insensitive",
            },
            type: "CUSTOM",
            status: "SENT",
          },
          include: {
            client: true,
            user: true,
          },
          orderBy: {
            sentAt: "desc",
          },
        });
      }

      if (!originalEmail) {
        console.warn("Could not find original email for reply:", from);
        return NextResponse.json(
          { message: "Original email not found" },
          { status: 200 } // Return 200 to acknowledge receipt
        );
      }

      // Save the incoming reply
      const incomingLog = await prisma.communicationLog.create({
        data: {
          type: "INCOMING_EMAIL",
          channel: "EMAIL",
          recipient: to[0] || "", // The therapist's email
          subject: subject || "ללא נושא",
          content: html || text || "",
          status: "RECEIVED",
          sentAt: new Date(),
          messageId: message_id,
          inReplyTo: in_reply_to || originalEmail.messageId,
          isRead: false,
          clientId: originalEmail.clientId,
          userId: originalEmail.userId,
        },
      });

      console.log("Saved incoming email:", incomingLog.id);

      // Create notification for therapist
      if (originalEmail.userId) {
        await prisma.notification.create({
          data: {
            userId: originalEmail.userId,
            type: "EMAIL_RECEIVED",
            title: `תשובה חדשה מ-${originalEmail.client?.name || "מטופל"} 📧`,
            content: `נושא: ${subject || "ללא נושא"}`,
            status: "SENT",
            sentAt: new Date(),
          },
        });

        console.log("Created notification for user:", originalEmail.userId);
      }

      return NextResponse.json({
        message: "Email reply processed successfully",
        logId: incomingLog.id,
      });
    }

    // Acknowledge other event types
    return NextResponse.json({ message: "Event received" });
  } catch (error) {
    console.error("Resend webhook error:", error);
    // Return 200 to prevent Resend from retrying
    return NextResponse.json(
      { message: "Error processing webhook", error: String(error) },
      { status: 200 }
    );
  }
}
