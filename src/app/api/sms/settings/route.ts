import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser, isSecretary, secretaryCan } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const settings = await prisma.sMSSettings.findUnique({
      where: { therapistId: userId },
    });

    // Return default settings if none exist
    if (!settings) {
      return NextResponse.json({
        enabled: false,
        hoursBeforeReminder: 24,
        customMessage: null,
        sendOnWeekends: true,
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    logger.error("Get SMS settings error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת ההגדרות" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    // הגדרות תזכורות SMS — חסומות למזכירה ללא canSendReminders.
    const scopeUser = await loadScopeUser(userId);
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canSendReminders")) {
      return NextResponse.json(
        { message: "אין הרשאה לשליחת תזכורות" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { enabled, hoursBeforeReminder, customMessage, sendOnWeekends } = body;

    const settings = await prisma.sMSSettings.upsert({
      where: { therapistId: userId },
      update: {
        enabled,
        hoursBeforeReminder,
        customMessage,
        sendOnWeekends,
      },
      create: {
        therapistId: userId,
        enabled,
        hoursBeforeReminder,
        customMessage,
        sendOnWeekends,
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    logger.error("Update SMS settings error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בשמירת ההגדרות" },
      { status: 500 }
    );
  }
}
