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
    const { clientIds, subject, content } = body;

    if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
      return NextResponse.json(
        { message: "נא לבחור לפחות מטופל אחד" },
        { status: 400 }
      );
    }

    if (!subject || !content) {
      return NextResponse.json(
        { message: "נא למלא את כל השדות" },
        { status: 400 }
      );
    }

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    // Get all selected clients
    const clients = await prisma.client.findMany({
      where: {
        id: { in: clientIds },
        therapistId: session.user.id,
      },
    });

    // Filter clients with email
    const clientsWithEmail = clients.filter(c => c.email);

    if (clientsWithEmail.length === 0) {
      return NextResponse.json(
        { message: "אף אחד מהמטופלים שנבחרו אין מייל" },
        { status: 400 }
      );
    }

    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    // Send emails in parallel (but with rate limiting)
    const sendPromises = clientsWithEmail.map(async (client) => {
      try {
        // Replace {name} with client's first name
        const personalizedSubject = subject.replace(/{name}/g, client.firstName || client.name);
        const personalizedContent = content.replace(/{name}/g, client.firstName || client.name);

        const { subject: emailSubject, html } = createGenericEmail(
          client.name,
          personalizedSubject,
          personalizedContent,
          user?.name || "המטפל/ת שלך"
        );

        const result = await sendEmail({
          to: client.email!.toLowerCase(),
          subject: emailSubject,
          html,
          replyTo: user?.email?.toLowerCase() || undefined,
        });

        // Log communication
        await prisma.communicationLog.create({
          data: {
            type: "CUSTOM",
            channel: "EMAIL",
            recipient: client.email!.toLowerCase(),
            subject: emailSubject,
            content: html,
            status: result.success ? "SENT" : "FAILED",
            errorMessage: result.success ? null : String(result.error),
            sentAt: result.success ? new Date() : null,
            clientId: client.id,
            userId: session.user.id,
          },
        });

        if (result.success) {
          successCount++;
          return { success: true, clientName: client.name };
        } else {
          failureCount++;
          errors.push(`${client.name}: ${result.error}`);
          return { success: false, clientName: client.name, error: result.error };
        }
      } catch (error) {
        failureCount++;
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${client.name}: ${errorMsg}`);
        return { success: false, clientName: client.name, error: errorMsg };
      }
    });

    // Wait for all emails to be sent
    await Promise.all(sendPromises);

    // Create notification
    await prisma.notification.create({
      data: {
        userId: session.user.id,
        type: "EMAIL_SENT",
        title: `מיילים נשלחו ל-${successCount} מטופלים ✅`,
        content: `נושא: ${subject}\n${failureCount > 0 ? `נכשלו: ${failureCount}` : ""}`,
        status: "SENT",
        sentAt: new Date(),
      },
    });

    return NextResponse.json({
      message: `${successCount} מיילים נשלחו בהצלחה`,
      sent: successCount,
      failed: failureCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Bulk send email error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בשליחת המיילים" },
      { status: 500 }
    );
  }
}
