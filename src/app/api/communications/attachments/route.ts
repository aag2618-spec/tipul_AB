import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Resend } from "resend";
import storage from "@/lib/storage";
import { logger } from "@/lib/logger";
import { logDelegatedCreate } from "@/lib/audit";

import { requireAuth } from "@/lib/api-auth";
import { buildClientWhere, loadScopeUser, resolveTherapistIdForClientChild } from "@/lib/scope";
import { parseBody, parseSearchParams } from "@/lib/validations/helpers";
import {
  attachmentDownloadQuerySchema,
  saveAttachmentSchema,
} from "@/lib/validations/communications";
import { sanitizeDownloadFilename } from "@/lib/file-validation";

// GET - Download attachment from Resend
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    const clientWhere = buildClientWhere(scopeUser);

    const parsedQuery = parseSearchParams(request.url, attachmentDownloadQuerySchema);
    if ("error" in parsedQuery) return parsedQuery.error;
    const { logId, attachmentId, filename } = parsedQuery.data;

    // Verify this log belongs to the user OR to a client in the user's scope.
    const log = await prisma.communicationLog.findFirst({
      where: {
        id: logId,
        OR: [
          { userId: userId },
          { client: clientWhere },
        ],
      },
    });

    if (!log) {
      return NextResponse.json({ message: "רשומת ההודעה לא נמצאה" }, { status: 404 });
    }

    // For sent emails, attachments aren't stored in Resend after sending
    if (log.type !== "INCOMING_EMAIL" && log.type !== "INCOMING_SMS") {
      return NextResponse.json({ 
        message: "קבצים שנשלחו על ידך לא ניתנים להורדה חוזרת. ניתן להוריד רק קבצים שנשלחו ע\"י מטופלים." 
      }, { status: 410 });
    }

    // Get the Resend email ID from attachments metadata
    const attachments = (log.attachments as Array<{ id?: string; resendEmailId?: string; filename: string }>) || [];
    // Find by ID first, then by filename
    const attachment = (attachmentId ? attachments.find(a => a.id === attachmentId) : null) 
      || attachments.find(a => a.filename === filename);
    
    // Use attachment-level resendEmailId, or fallback to the log messageId
    const resendEmailId = attachment?.resendEmailId || log.messageId;
    const actualAttachmentId = attachment?.id || attachmentId;
    
    if (!resendEmailId || !actualAttachmentId) {
      return NextResponse.json({ message: "לא ניתן לזהות את הקובץ" }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({ message: "שירות שליחת המיילים אינו מוגדר" }, { status: 500 });
    }

    // Fetch attachment metadata from Resend receiving API
    const resend = new Resend(resendApiKey);
    const { data: attachmentData } = await resend.emails.receiving.attachments.get({
      id: actualAttachmentId,
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
    // round15 (L5): filename מגיע מ-query string של המשתמש — חייב סינון
    // נגד Unicode bidi-override (RTL spoofing) ו-header injection.
    const { asciiSafe, utf8Encoded } = sanitizeDownloadFilename(filename);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${asciiSafe}"; filename*=UTF-8''${utf8Encoded}`
    );
    headers.set("Content-Length", buffer.length.toString());

    return new NextResponse(buffer, { headers });
  } catch (error) {
    logger.error("Download attachment error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בהורדת הקובץ" },
      { status: 500 }
    );
  }
}

// POST - Save attachment to patient folder
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, originalUserId, isImpersonating } = auth;

    const scopeUser = await loadScopeUser(userId);
    const clientWhere = buildClientWhere(scopeUser);

    const parsedBody = await parseBody(request, saveAttachmentSchema);
    if ("error" in parsedBody) return parsedBody.error;
    const { logId, attachmentId, filename, clientId } = parsedBody.data;

    // Verify this log belongs to the user OR to a client in user's scope.
    const log = await prisma.communicationLog.findFirst({
      where: {
        id: logId,
        OR: [
          { userId: userId },
          { client: clientWhere },
        ],
      },
    });

    if (!log) {
      return NextResponse.json({ message: "רשומת ההודעה לא נמצאה" }, { status: 404 });
    }

    // Verify target client is in user's scope before linking the attachment.
    const targetClient = await prisma.client.findFirst({
      where: { AND: [{ id: clientId }, clientWhere] },
      select: { id: true, therapistId: true },
    });
    if (!targetClient) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // Get Resend email ID
    const attachments = (log.attachments as Array<{ id?: string; resendEmailId?: string; filename: string }>) || [];
    const attachment = (attachmentId ? attachments.find(a => a.id === attachmentId) : null) 
      || attachments.find(a => a.filename === filename);
    const resendEmailId = attachment?.resendEmailId || log.messageId;
    const actualAttachmentId = attachment?.id || attachmentId;

    if (!resendEmailId || !actualAttachmentId) {
      return NextResponse.json({ message: "לא ניתן לזהות את הקובץ" }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({ message: "שירות שליחת המיילים אינו מוגדר" }, { status: 500 });
    }

    // Fetch attachment metadata from Resend (returns download_url)
    const resend = new Resend(resendApiKey);
    const { data: attachmentData } = await resend.emails.receiving.attachments.get({
      id: actualAttachmentId,
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

    const safeFilename = (filename || "file").replace(/[^a-zA-Z0-9._\u0590-\u05FF -]/g, "_");
    const { randomUUID } = await import("crypto");
    const uniqueFilename = `${randomUUID()}_${safeFilename}`;

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    await storage.write(`clients/${clientId}/${uniqueFilename}`, buffer);

    // Phase 2: Document שנשמר ללקוח יישמר תחת המטפל של הלקוח (לא של המבצע) —
    // כך שמזכירה ששומרת מייל נכנס בתיקיית מטופל לא "תופסת" את הבעלות.
    const finalTherapistId = resolveTherapistIdForClientChild({
      scopeUser,
      client: targetClient,
    });

    const document = await prisma.document.create({
      data: {
        name: filename || "קובץ מצורף ממייל",
        type: "OTHER",
        fileUrl: `/api/uploads/clients/${clientId}/${uniqueFilename}`,
        clientId: clientId,
        therapistId: finalTherapistId,
        organizationId: scopeUser.organizationId,
      },
    });

    // Phase 2: audit לשמירת מייל מצורף בשם מטפל אחר.
    await logDelegatedCreate({
      operatorId: userId,
      targetTherapistId: finalTherapistId,
      recordType: "ATTACHMENT",
      recordId: document.id,
      organizationId: scopeUser.organizationId,
      clientId,
      ...(isImpersonating ? { impersonatedBy: originalUserId } : {}),
    });

    return NextResponse.json({
      success: true,
      documentId: document.id,
      message: "הקובץ נשמר בתיקיית המטופל",
    });
  } catch (error) {
    logger.error("Save attachment error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בשמירת הקובץ" },
      { status: 500 }
    );
  }
}
