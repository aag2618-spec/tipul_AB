import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const settings = await prisma.notificationSetting.findMany({
      where: { userId: userId },
    });

    return NextResponse.json(settings);
  } catch (error) {
    logger.error("Get notification settings error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת ההגדרות" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const body = await request.json();
    const { emailEnabled, pushEnabled, morningTime, eveningTime, debtThresholdDays, monthlyReminderDay } = body;

    // Update or create email settings
    const existingEmail = await prisma.notificationSetting.findFirst({
      where: { userId: userId, channel: "email" },
    });

    if (existingEmail) {
      await prisma.notificationSetting.update({
        where: { id: existingEmail.id },
        data: {
          enabled: emailEnabled,
          morningTime,
          eveningTime,
          debtThresholdDays,
          monthlyReminderDay: monthlyReminderDay || null,
        },
      });
    } else {
      await prisma.notificationSetting.create({
        data: {
          userId: userId,
          channel: "email",
          enabled: emailEnabled,
          morningTime,
          eveningTime,
          debtThresholdDays,
          monthlyReminderDay: monthlyReminderDay || null,
        },
      });
    }

    // Update or create push settings
    const existingPush = await prisma.notificationSetting.findFirst({
      where: { userId: userId, channel: "push" },
    });

    if (existingPush) {
      await prisma.notificationSetting.update({
        where: { id: existingPush.id },
        data: {
          enabled: pushEnabled,
          morningTime,
          eveningTime,
          debtThresholdDays,
        },
      });
    } else {
      await prisma.notificationSetting.create({
        data: {
          userId: userId,
          channel: "push",
          enabled: pushEnabled,
          morningTime,
          eveningTime,
          debtThresholdDays,
        },
      });
    }

    const settings = await prisma.notificationSetting.findMany({
      where: { userId: userId },
    });

    return NextResponse.json(settings);
  } catch (error) {
    logger.error("Update notification settings error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון ההגדרות" },
      { status: 500 }
    );
  }
}







