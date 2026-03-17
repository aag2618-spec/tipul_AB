import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    await prisma.notification.delete({
      where: { 
        id,
        userId: userId, // Security: only allow deleting own notifications
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Delete notification error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת ההתראה" },
      { status: 500 }
    );
  }
}
