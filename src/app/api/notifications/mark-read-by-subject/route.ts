import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { markBySubjectSchema } from "@/lib/validations/notification";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const parsed = await parseBody(request, markBySubjectSchema);
    if ("error" in parsed) return parsed.error;
    const { subject } = parsed.data;

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
