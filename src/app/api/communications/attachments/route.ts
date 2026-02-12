import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import path from "path";
import fs from "fs/promises";

// GET - Download attachment from Resend
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const logId = searchParams.get("logId");
    const attachmentId = searchParams.get("attachmentId");
    const filename = searchParams.get("filename");

    if (!logId || !attachmentId) {
      return NextResponse.json({ message: "חסרים פרמטרים" }, { status: 400 });
    }

    // Verify this log belongs to the user
    const log = await prisma.communicationLog.findFirst({
      where: { id: logId, userId: session.user.id },
    });

    if (!log) {
      return NextResponse.json({ message: "לא נמצא" }, { status: 404 });
    }

    // For sent emails, attachments aren't stored in Resend after sending
    const isSentByTherapist = log.type !== "INCOMING_EMAIL";

    // Get the Resend email ID from attachments metadata or messageId
    const attachments = (log.attachments as Array<{ id?: string; resendEmailId?: string; filename: string }>) || [];
    const attachment = attachments.find(a => a.id === attachmentId || a.filename === filename);
    
    const resendEmailId = attachment?.resendEmailId || log.messageId;
    
    if (!resendEmailId) {
      return NextResponse.json({ message: "לא ניתן לזהות את המייל" }, { status: 400 });
    }

    if (isSentByTherapist) {
      return NextResponse.json({ 
        message: "קבצים שנשלחו על ידך לא נשמרים לאחר שליחה. ניתן להוריד רק קבצים שנשלחו ע\"י מטופלים." 
      }, { status: 410 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({ message: "Resend API not configured" }, { status: 500 });
    }

    // Fetch attachment metadata from Resend receiving API
    const resend = new Resend(resendApiKey);
    const { data: attachmentData } = await resend.emails.receiving.attachments.get({
      id: attachmentId,
      emailId: resendEmailId,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attData = attachmentData as any;
    const downloadUrl = attData?.download_url || attData?.downloadUrl;
    const contentType = attData?.content_type || attData?.contentType || "application/octet-stream";

    if (!downloadUrl) {
      return NextResponse.json({ message: "לא ניתן להוריד את הקובץ" }, { status: 404 });
    }

    // Download the file from Resend signed URL
    const fileResponse = await fetch(downloadUrl);
    if (!fileResponse.ok) {
      return NextResponse.json({ message: "שגיאה בהורדת הקובץ מ-Resend" }, { status: 500 });
    }

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(filename || "file")}"` );
    headers.set("Content-Length", buffer.length.toString());

    return new NextResponse(buffer, { headers });
  } catch (error) {
    console.error("Download attachment error:", error);
    return NextResponse.json(
      { message: "שגיאה בהורדת הקובץ" },
      { status: 500 }
    );
  }
}

// POST - Save attachment to patient folder
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { logId, attachmentId, filename, clientId } = await request.json();

    if (!logId || !attachmentId || !clientId) {
      return NextResponse.json({ message: "חסרים פרמטרים" }, { status: 400 });
    }

    // Verify this log belongs to the user
    const log = await prisma.communicationLog.findFirst({
      where: { id: logId, userId: session.user.id },
    });

    if (!log) {
      return NextResponse.json({ message: "לא נמצא" }, { status: 404 });
    }

    // Get Resend email ID
    const attachments = (log.attachments as Array<{ id?: string; resendEmailId?: string; filename: string }>) || [];
    const attachment = attachments.find(a => a.id === attachmentId || a.filename === filename);
    const resendEmailId = attachment?.resendEmailId || log.messageId;

    if (!resendEmailId) {
      return NextResponse.json({ message: "לא ניתן לזהות את המייל" }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({ message: "Resend API not configured" }, { status: 500 });
    }

    // Fetch attachment metadata from Resend (returns download_url)
    const resend = new Resend(resendApiKey);
    const { data: attachmentData } = await resend.emails.receiving.attachments.get({
      id: attachmentId,
      emailId: resendEmailId,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attData2 = attachmentData as any;
    const downloadUrl2 = attData2?.download_url || attData2?.downloadUrl;

    if (!downloadUrl2) {
      return NextResponse.json({ message: "לא ניתן להוריד את הקובץ" }, { status: 404 });
    }

    // Download file from Resend signed URL
    const fileResponse = await fetch(downloadUrl2);
    if (!fileResponse.ok) {
      return NextResponse.json({ message: "שגיאה בהורדת הקובץ מ-Resend" }, { status: 500 });
    }

    // Save to disk
    const uploadsDir = process.env.UPLOADS_DIR || "/var/data/uploads";
    const clientDir = path.join(uploadsDir, "clients", clientId);
    await fs.mkdir(clientDir, { recursive: true });

    const safeFilename = (filename || "file").replace(/[^a-zA-Z0-9._\u0590-\u05FF -]/g, "_");
    const uniqueFilename = `${Date.now()}_${safeFilename}`;
    const filePath = path.join(clientDir, uniqueFilename);

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    // Create Document record linked to client
    const document = await prisma.document.create({
      data: {
        name: filename || "קובץ מצורף ממייל",
        type: "OTHER",
        fileUrl: `/uploads/clients/${clientId}/${uniqueFilename}`,
        clientId: clientId,
        therapistId: session.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      documentId: document.id,
      message: "הקובץ נשמר בתיקיית המטופל",
    });
  } catch (error) {
    console.error("Save attachment error:", error);
    return NextResponse.json(
      { message: "שגיאה בשמירת הקובץ" },
      { status: 500 }
    );
  }
}
