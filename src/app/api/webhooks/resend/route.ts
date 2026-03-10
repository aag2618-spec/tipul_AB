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
    const svixId = headersList.get("svix-id");
    const svixTimestamp = headersList.get("svix-timestamp");
    const svixSignature = headersList.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn("Resend webhook: missing Svix headers");
      return NextResponse.json({ error: "Missing webhook headers" }, { status: 401 });
    }

    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret) {
      const crypto = await import("crypto");
      const signedContent = `${svixId}.${svixTimestamp}.${await request.clone().text()}`;
      const secret = webhookSecret.startsWith("whsec_") 
        ? webhookSecret.slice(6) 
        : webhookSecret;
      const secretBytes = Buffer.from(secret, "base64");
      const expectedSignature = crypto
        .createHmac("sha256", secretBytes)
        .update(signedContent)
        .digest("base64");
      
      const signatures = svixSignature.split(" ");
      const isValid = signatures.some((sig) => {
        const sigValue = sig.split(",")[1];
        return sigValue === expectedSignature;
      });
      
      if (!isValid) {
        console.warn("Resend webhook: invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const body = await request.json();

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
        attachments: rawAttachments,
      } = data;

      const senderEmail = extractEmail(rawFrom || "");

      // Parse attachment metadata from Resend
      const attachmentMeta = Array.isArray(rawAttachments)
        ? rawAttachments.map((att: { id: string; filename: string; content_type: string }) => ({
            id: att.id,
            filename: att.filename,
            contentType: att.content_type,
            resendEmailId: email_id,
          }))
        : [];

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
      // recipient = who received the email (the system inbox), not who sent it
      const recipientAddress = Array.isArray(to) ? to[0] : (to || "inbox@mytipul.com");
      const incomingLog = await prisma.communicationLog.create({
        data: {
          type: "INCOMING_EMAIL",
          channel: "EMAIL",
          recipient: recipientAddress,
          subject: subject || "ללא נושא",
          content: content,
          status: "RECEIVED",
          sentAt: new Date(),
          messageId: message_id || email_id,
          inReplyTo: in_reply_to || originalEmail?.messageId || null,
          isRead: false,
          clientId: clientRecord.id,
          userId: therapistId,
          ...(attachmentMeta.length > 0 && { attachments: attachmentMeta }),
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
