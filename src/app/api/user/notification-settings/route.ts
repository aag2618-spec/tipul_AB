import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { updateNotificationSettingsSchema } from "@/lib/validations/user-settings";

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
    const { userId } = auth;

    const parsed = await parseBody(request, updateNotificationSettingsSchema);
    if ("error" in parsed) return parsed.error;
    const {
      emailEnabled,
      pushEnabled,
      debtThresholdDays,
      monthlyReminderDay,
      morningTime,
      eveningTime,
    } = parsed.data;

    const emailEnabledSafe = emailEnabled;
    const pushEnabledSafe = pushEnabled;
    const debtThresholdDaysSafe = debtThresholdDays ?? undefined;
    const monthlyReminderDaySafe = monthlyReminderDay;
    const morningTimeSafe = morningTime === "" ? null : morningTime;
    const eveningTimeSafe = eveningTime === "" ? null : eveningTime;

    // Update or create email settings
    const existingEmail = await prisma.notificationSetting.findFirst({
      where: { userId: userId, channel: "email" },
    });

    if (existingEmail) {
      await prisma.notificationSetting.update({
        where: { id: existingEmail.id },
        data: {
          enabled: emailEnabledSafe,
          debtThresholdDays: debtThresholdDaysSafe,
          monthlyReminderDay: monthlyReminderDaySafe,
          morningTime: morningTimeSafe,
          eveningTime: eveningTimeSafe,
        },
      });
    } else {
      await prisma.notificationSetting.create({
        data: {
          userId: userId,
          channel: "email",
          enabled: emailEnabledSafe ?? true,
          debtThresholdDays: debtThresholdDaysSafe ?? 30,
          monthlyReminderDay: monthlyReminderDaySafe ?? null,
          morningTime: morningTimeSafe ?? null,
          eveningTime: eveningTimeSafe ?? null,
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
          enabled: pushEnabledSafe,
          debtThresholdDays: debtThresholdDaysSafe,
        },
      });
    } else {
      await prisma.notificationSetting.create({
        data: {
          userId: userId,
          channel: "push",
          enabled: pushEnabledSafe ?? true,
          debtThresholdDays: debtThresholdDaysSafe ?? 30,
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







