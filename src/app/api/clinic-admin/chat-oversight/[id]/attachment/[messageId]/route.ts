// ============================================================================
// GET /api/clinic-admin/chat-oversight/[id]/attachment/[messageId]
// ============================================================================
// הורדת קובץ מצורף משיחת מטפלים — למסך המעקב של המנהלת (קריאה בלבד).
// אבטחה: requireClinicOwner + השיחה באותו ארגון, אינה ערוץ צוות/הודעות, והיא
// "בין מטפלים בלבד" (isTherapistOnly) — אחרת 404/403. תיעוד audit. זרימת בייטים
// עם allow-list של content-types (ללא HTML/SVG), no-store ו-nosniff.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import storage from "@/lib/storage";
import { logger } from "@/lib/logger";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";
import { isTherapistOnly } from "@/lib/chat/chat-service";
import { sanitizeDownloadFilename } from "@/lib/file-validation";
import { logDataAccess } from "@/lib/audit-logger";

export const dynamic = "force-dynamic";

const SERVE_CONTENT_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId, userId } = auth;
    const { id, messageId } = await params;

    const convo = await prisma.chatConversation.findFirst({
      // ערוצי צוות/הודעות מוחרגים — המעקב הוא רק על שיחות בין מטפלים.
      where: { id, organizationId, isTeamChannel: false, isBroadcast: false },
      select: {
        participants: {
          select: { user: { select: { clinicRole: true, role: true } } },
        },
      },
    });
    if (!convo) {
      return NextResponse.json({ message: "הקובץ לא נמצא" }, { status: 404 });
    }
    const therapistOnly = isTherapistOnly(
      convo.participants.map((p) => ({
        clinicRole: p.user.clinicRole,
        role: p.user.role,
      }))
    );
    if (!therapistOnly) {
      return NextResponse.json(
        { message: "השיחה אינה זמינה למעקב" },
        { status: 403 }
      );
    }

    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, conversationId: id, deletedAt: null },
      select: {
        attachmentPath: true,
        attachmentName: true,
        attachmentType: true,
      },
    });
    if (!message || !message.attachmentPath) {
      return NextResponse.json({ message: "הקובץ לא נמצא" }, { status: 404 });
    }

    const exists = await storage.exists(message.attachmentPath);
    if (!exists) {
      return NextResponse.json({ message: "הקובץ לא נמצא" }, { status: 404 });
    }
    const fileBuf = await storage.read(message.attachmentPath);

    // תיעוד audit — המנהלת קראה קובץ מצורף בשיחת מטפלים.
    logDataAccess({
      userId,
      recordType: "THERAPIST_CHAT",
      recordId: id,
      action: "READ",
      request,
      meta: { feature: "chat-oversight-attachment", messageId },
    });

    const contentType = SERVE_CONTENT_TYPES.has(message.attachmentType ?? "")
      ? (message.attachmentType as string)
      : "application/octet-stream";
    const { asciiSafe, utf8Encoded } = sanitizeDownloadFilename(
      message.attachmentName
    );

    return new NextResponse(new Uint8Array(fileBuf), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": fileBuf.length.toString(),
        "Content-Disposition": `inline; filename="${asciiSafe}"; filename*=UTF-8''${utf8Encoded}`,
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error("[clinic-admin/chat-oversight] attachment error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בהורדת הקובץ" },
      { status: 500 }
    );
  }
}
