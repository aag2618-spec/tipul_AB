import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    await prisma.notification.updateMany({
      where: {
        userId: userId,
        status: { in: ["PENDING", "SENT"] },
      },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, message: "כל ההתראות סומנו כנקראו" });
  } catch (error) {
    logger.error("Mark all as read error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון ההתראות" },
      { status: 500 }
    );
  }
}
