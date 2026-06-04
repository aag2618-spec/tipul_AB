// ============================================================================
// POST /api/chat/conversations/[id]/attachment — שליחת הודעה עם קובץ מצורף
// ============================================================================
// multipart/form-data: "file" (חובה) + "body" (כיתוב אופציונלי).
// אבטחה: requireChatAccess + בדיקת השתתפות פעילה בשיחה (IDOR) + שער broadcast
// (רק מנהלת/מזכירה כותבות בערוץ ההודעות) + rate limit. הקובץ עובר ולידציית
// magic-bytes (file-validation) והסרת EXIF לתמונות, ונשמר ב-storage (R2/דיסק).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import storage from "@/lib/storage";
import { logger } from "@/lib/logger";
import { requireChatAccess } from "@/lib/chat/require-chat-access";
import { checkRateLimit, CHAT_MESSAGE_RATE_LIMIT } from "@/lib/rate-limit";
import {
  MESSAGE_SELECT,
  serializeMessage,
} from "@/lib/chat/message-serialize";
import {
  validateFileBuffer,
  stripImageMetadata,
  safeExtensionForMime,
  getCategoryMaxSize,
} from "@/lib/file-validation";

export const dynamic = "force-dynamic";

const MAX_CAPTION = 4000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireChatAccess();
    if ("error" in auth) return auth.error;
    const { userId, organizationId, isOwner, isSecretary } = auth;
    const { id } = await params;

    const rl = checkRateLimit(`chat:msg:${userId}`, CHAT_MESSAGE_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { message: "יותר מדי הודעות — נסה/י שוב בעוד רגע" },
        { status: 429 }
      );
    }

    // השתתפות פעילה + בידוד ארגוני (IDOR guard) + דגל broadcast.
    const participant = await prisma.chatParticipant.findFirst({
      where: {
        conversationId: id,
        userId,
        leftAt: null,
        conversation: { organizationId },
      },
      select: { id: true, conversation: { select: { isBroadcast: true } } },
    });
    if (!participant) {
      return NextResponse.json({ message: "השיחה לא נמצאה" }, { status: 404 });
    }
    if (participant.conversation.isBroadcast && !isOwner && !isSecretary) {
      return NextResponse.json(
        { message: "רק המנהלת והמזכירות יכולות לכתוב בערוץ ההודעות" },
        { status: 403 }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { message: "טופס הקובץ אינו תקין" },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ message: "לא נבחר קובץ" }, { status: 400 });
    }

    const captionRaw = formData.get("body");
    const caption =
      typeof captionRaw === "string"
        ? captionRaw.trim().slice(0, MAX_CAPTION)
        : "";

    // בדיקת גודל מוקדמת (לפני קריאה מלאה לזיכרון).
    const maxSize = getCategoryMaxSize("chatAttachment");
    if (file.size > maxSize) {
      return NextResponse.json(
        { message: `הקובץ גדול מדי (מקסימום ${maxSize / (1024 * 1024)}MB)` },
        { status: 400 }
      );
    }

    let buffer: Buffer = Buffer.from(await file.arrayBuffer());

    // ולידציה: גודל + MIME + magic-bytes (חוסם exe/script שמתחזה לקובץ office).
    const validation = validateFileBuffer(buffer, file.type, "chatAttachment");
    if (!validation.ok) {
      return NextResponse.json(
        { message: validation.error || "סוג הקובץ אינו נתמך" },
        { status: 400 }
      );
    }

    // הסרת EXIF/GPS מתמונות (מניעת דליפת מיקום) — re-check גודל אחרי sharp.
    buffer = await stripImageMetadata(buffer, file.type);
    if (buffer.length > maxSize) {
      return NextResponse.json(
        { message: `הקובץ גדול מדי (מקסימום ${maxSize / (1024 * 1024)}MB)` },
        { status: 400 }
      );
    }

    // שם אחסון בטוח — extension נגזר מה-MIME המאומת (לא משם המשתמש).
    const ext = safeExtensionForMime(file.type);
    const storedName = `${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`;
    const relativePath = `chat/${id}/${storedName}`;
    await storage.write(relativePath, buffer, file.type);

    // שם תצוגה — שם הקובץ המקורי (מוגבל אורך). תווי bidi/header מסוננים בעת ההורדה.
    const displayName = (file.name || `קובץ.${ext}`).slice(0, 255);

    const message = await prisma.chatMessage.create({
      data: {
        conversationId: id,
        senderId: userId,
        body: caption,
        attachmentPath: relativePath,
        attachmentName: displayName,
        attachmentType: file.type,
        attachmentSize: buffer.length,
      },
      select: MESSAGE_SELECT,
    });

    await prisma.$transaction([
      prisma.chatConversation.update({
        where: { id },
        data: { lastMessageAt: message.createdAt },
      }),
      prisma.chatParticipant.updateMany({
        where: { conversationId: id, userId },
        data: { lastReadAt: message.createdAt },
      }),
    ]);

    return NextResponse.json(
      { message: serializeMessage(message) },
      { status: 201 }
    );
  } catch (error) {
    logger.error("[Chat] Send attachment error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בשליחת הקובץ" },
      { status: 500 }
    );
  }
}
