import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    // Get all communication logs for this therapist (sent + received)
    const logs = await prisma.communicationLog.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        type: true,
        channel: true,
        recipient: true,
        subject: true,
        content: true,
        status: true,
        errorMessage: true,
        sentAt: true,
        createdAt: true,
        isRead: true,
        readAt: true,
        messageId: true,
        inReplyTo: true,
        attachments: true,
        client: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
    });

    return NextResponse.json(logs);
  } catch (error) {
    logger.error("Get communication logs error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת לוג תקשורת" },
      { status: 500 }
    );
  }
}
