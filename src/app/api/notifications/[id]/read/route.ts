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

    await prisma.notification.update({
      where: { 
        id,
        userId: userId, // Security: only allow updating own notifications
      },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Mark notification as read error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון ההתראה" },
      { status: 500 }
    );
  }
}
