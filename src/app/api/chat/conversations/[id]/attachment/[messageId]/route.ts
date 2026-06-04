// ============================================================================
// GET /api/chat/conversations/[id]/attachment/[messageId] — הורדת קובץ מצורף
// ============================================================================
// מגיש את הקובץ אך ורק למשתתף פעיל בשיחה (IDOR guard) — לכן קבצי הצ׳אט אינם
// מוגשים דרך /api/uploads (שם נחסם הנתיב chat/). זורם את הבייטים מ-storage, עם
// allow-list של content-types (ללא HTML/SVG → אין XSS), no-store ו-nosniff.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import storage from "@/lib/storage";
import { logger } from "@/lib/logger";
import { requireChatAccess } from "@/lib/chat/require-chat-access";
import { sanitizeDownloadFilename } from "@/lib/file-validation";

export const dynamic = "force-dynamic";

// רק סוגים שאומתו בהעלאה (file-validation chatAttachment). כל היתר → octet-stream
// (הורדה, לא רינדור) — הגנה נוספת מפני content-type spoofing.
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const auth = await requireChatAccess();
    if ("error" in auth) return auth.error;
    const { userId, organizationId } = auth;
    const { id, messageId } = await params;

    // השתתפות פעילה בשיחה + בידוד ארגוני — תנאי הכרחי לכל גישה לקובץ.
    const participant = await prisma.chatParticipant.findFirst({
      where: {
        conversationId: id,
        userId,
        leftAt: null,
        conversation: { organizationId },
      },
      select: { id: true },
    });
    if (!participant) {
      return NextResponse.json({ message: "הקובץ לא נמצא" }, { status: 404 });
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
        // PHI: לא לשמור ב-cache של דפדפן/CDN; לא לנחש סוג תוכן.
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error("[Chat] Download attachment error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בהורדת הקובץ" },
      { status: 500 }
    );
  }
}
