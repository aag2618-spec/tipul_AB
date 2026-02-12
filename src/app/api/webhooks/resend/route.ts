import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { headers } from "next/headers";
import { Resend } from "resend";

// Extract email from "Name <email@example.com>" format or plain email
function extractEmail(raw: string): string {
  const match = raw.match(/<(.+?)>/);
  return (match ? match[1] : raw).toLowerCase().trim();
}

// Resend webhook for incoming email replies
export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const signature = headersList.get("svix-signature");
    
    const body = await request.json();
    console.log("Resend webhook received:", JSON.stringify(body, null, 2));

    const { type, data } = body;

    if (type === "email.received" || type === "email.replied") {
      const {
        email_id,
        message_id,
        from: rawFrom,
        to,
        subject,
        in_reply_to,
        references,
      } = data;

      const senderEmail = extractEmail(rawFrom || "");

      console.log("Processing incoming email:", {
        email_id,
        message_id,
        senderEmail,
        to,
        subject,
        in_reply_to,
      });

      // --- Fetch actual email content from Resend API ---
      let emailHtml = "";
      let emailText = "";
      
      if (email_id && process.env.RESEND_API_KEY) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const { data: emailContent } = await resend.emails.receiving.get(email_id);
          
          if (emailContent) {
            emailHtml = emailContent.html || "";
            emailText = emailContent.text || "";
            console.log("Fetched email content, html length:", emailHtml.length, "text length:", emailText.length);
          }
        } catch (fetchError) {
          console.error("Error fetching email content from Resend:", fetchError);
        }
      }

      const content = emailHtml || emailText || "(לא ניתן לטעון את תוכן המייל)";

      // Strategy 1: Find original email by in_reply_to header
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

      // Strategy 2: Find any recent email sent TO this sender
      if (!originalEmail && senderEmail) {
        originalEmail = await prisma.communicationLog.findFirst({
          where: {
            recipient: {
              equals: senderEmail,
              mode: "insensitive",
            },
            status: "SENT",
            clientId: { not: null },
            userId: { not: null },
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

      // Strategy 3: Find client directly by email address
      let clientRecord = originalEmail?.client || null;
      let therapistId = originalEmail?.userId || null;

      if (!clientRecord && senderEmail) {
        clientRecord = await prisma.client.findFirst({
          where: {
            email: {
              equals: senderEmail,
              mode: "insensitive",
            },
          },
        });

        if (clientRecord) {
          therapistId = clientRecord.therapistId;
        }
      }

      if (!clientRecord || !therapistId) {
        console.warn("Could not find client for incoming email:", senderEmail);
        return NextResponse.json(
          { message: "Client not found for sender email" },
          { status: 200 }
        );
      }

      // Save the incoming reply with actual content
      const incomingLog = await prisma.communicationLog.create({
        data: {
          type: "INCOMING_EMAIL",
          channel: "EMAIL",
          recipient: senderEmail,
          subject: subject || "ללא נושא",
          content: content,
          status: "RECEIVED",
          sentAt: new Date(),
          messageId: message_id || email_id,
          inReplyTo: in_reply_to || originalEmail?.messageId || null,
          isRead: false,
          clientId: clientRecord.id,
          userId: therapistId,
        },
      });

      console.log("Saved incoming email with content:", incomingLog.id);

      // Create notification for therapist
      await prisma.notification.create({
        data: {
          userId: therapistId,
          type: "EMAIL_RECEIVED",
          title: `תשובה חדשה מ-${clientRecord.name || "מטופל"} 📧`,
          content: `נושא: ${subject || "ללא נושא"}`,
          status: "PENDING",
          sentAt: new Date(),
        },
      });

      console.log("Created notification for user:", therapistId);

      return NextResponse.json({
        message: "Email reply processed successfully",
        logId: incomingLog.id,
      });
    }

    // Acknowledge other event types
    return NextResponse.json({ message: "Event received" });
  } catch (error) {
    console.error("Resend webhook error:", error);
    return NextResponse.json(
      { message: "Error processing webhook", error: String(error) },
      { status: 200 }
    );
  }
}
