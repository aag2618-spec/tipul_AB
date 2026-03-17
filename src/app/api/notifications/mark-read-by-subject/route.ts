import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { subject } = await request.json();

    if (!subject) {
      return NextResponse.json({ message: "חסר נושא" }, { status: 400 });
    }

    // Mark notifications as read where the content contains the subject
    await prisma.notification.updateMany({
      where: {
        userId: userId,
        type: "EMAIL_RECEIVED",
        status: { in: ["PENDING", "SENT"] },
        content: { contains: subject },
      },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Mark notifications by subject error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה" },
      { status: 500 }
    );
  }
}
