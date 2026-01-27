import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail, createGenericEmail } from "@/lib/resend";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

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
      where: { id: clientId, therapistId: session.user.id },
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
      where: { id: session.user.id },
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
      replyTo: user?.email?.toLowerCase() || undefined, // תשובות יגיעו למטפל
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
        userId: session.user.id,
      },
    });

    if (!result.success) {
      console.error("Email send failed:", result.error);
      return NextResponse.json(
        { message: "שגיאה בשליחת המייל", error: result.error },
        { status: 500 }
      );
    }

    // Create notification for sent email
    await prisma.notification.create({
      data: {
        userId: session.user.id,
        type: "EMAIL_SENT",
        title: `מייל נשלח ל-${client.name} ✅`,
        content: `נושא: ${subject}`,
        status: "SENT",
        sentAt: new Date(),
      },
    });

    return NextResponse.json({ 
      message: "המייל נשלח בהצלחה",
      logId: communicationLog.id
    });
  } catch (error) {
    console.error("Send email error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בשליחת המייל" },
      { status: 500 }
    );
  }
}







