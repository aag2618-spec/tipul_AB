import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    // Find the communication log and verify ownership
    const log = await prisma.communicationLog.findFirst({
      where: {
        id,
        userId: userId,
        type: "INCOMING_EMAIL",
      },
    });

    if (!log) {
      return NextResponse.json(
        { message: "הודעה לא נמצאה" },
        { status: 404 }
      );
    }

    // Mark as read
    await prisma.communicationLog.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json({ message: "סומן כנקרא בהצלחה" });
  } catch (error) {
    logger.error("Mark as read error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון ההודעה" },
      { status: 500 }
    );
  }
}
