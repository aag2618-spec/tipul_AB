import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

// Create test notification - for testing only
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const notification = await prisma.notification.create({
      data: {
        userId: userId,
        type: "SESSION_REMINDER",
        title: "התראת בדיקה",
        content: "זוהי התראה לבדיקה שהמערכת עובדת",
        status: "PENDING",
      },
    });

    return NextResponse.json({ success: true, notification });
  } catch (error) {
    logger.error("Create test notification error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת ההתראה" },
      { status: 500 }
    );
  }
}
