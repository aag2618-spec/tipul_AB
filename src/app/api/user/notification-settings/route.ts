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

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    let body: Record<string, unknown>;
    try {
      const raw = await request.json();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
      }
      body = raw as Record<string, unknown>;
    } catch {
      return NextResponse.json({ message: "גוף בקשה לא תקין (JSON)" }, { status: 400 });
    }

    const { emailEnabled, pushEnabled, debtThresholdDays, monthlyReminderDay, morningTime, eveningTime } = body;

    // M-validation: booleans חייבים להיות boolean מפורש (לא truthy של כל ערך).
    if (emailEnabled !== undefined && typeof emailEnabled !== "boolean") {
      return NextResponse.json({ message: "emailEnabled חייב להיות boolean" }, { status: 400 });
    }
    if (pushEnabled !== undefined && typeof pushEnabled !== "boolean") {
      return NextResponse.json({ message: "pushEnabled חייב להיות boolean" }, { status: 400 });
    }
    const emailEnabledSafe: boolean | undefined = typeof emailEnabled === "boolean" ? emailEnabled : undefined;
    const pushEnabledSafe: boolean | undefined = typeof pushEnabled === "boolean" ? pushEnabled : undefined;

    // debtThresholdDays — מספר שלם 0-365 (Int non-nullable ב-Prisma).
    let debtThresholdDaysSafe: number | undefined = undefined;
    if (debtThresholdDays !== undefined && debtThresholdDays !== null) {
      if (
        typeof debtThresholdDays !== "number" ||
        !Number.isInteger(debtThresholdDays) ||
        debtThresholdDays < 0 ||
        debtThresholdDays > 365
      ) {
        return NextResponse.json(
          { message: "ימי חוב לפני התראה חייבים להיות מספר שלם 0-365" },
          { status: 400 }
        );
      }
      debtThresholdDaysSafe = debtThresholdDays;
    }

    // monthlyReminderDay — מספר 1-31 או null.
    let monthlyReminderDaySafe: number | null | undefined = undefined;
    if (monthlyReminderDay === null) {
      monthlyReminderDaySafe = null;
    } else if (monthlyReminderDay !== undefined) {
      if (
        typeof monthlyReminderDay !== "number" ||
        !Number.isInteger(monthlyReminderDay) ||
        monthlyReminderDay < 1 ||
        monthlyReminderDay > 31
      ) {
        return NextResponse.json(
          { message: "יום בחודש לתזכורת חייב להיות 1-31" },
          { status: 400 }
        );
      }
      monthlyReminderDaySafe = monthlyReminderDay;
    }

    // morningTime/eveningTime — HH:MM או null/"".
    let morningTimeSafe: string | null | undefined = undefined;
    if (morningTime === null || morningTime === "") {
      morningTimeSafe = null;
    } else if (morningTime !== undefined) {
      if (typeof morningTime !== "string" || !HHMM_RE.test(morningTime)) {
        return NextResponse.json(
          { message: "שעת בוקר חייבת להיות בפורמט HH:MM" },
          { status: 400 }
        );
      }
      morningTimeSafe = morningTime;
    }
    let eveningTimeSafe: string | null | undefined = undefined;
    if (eveningTime === null || eveningTime === "") {
      eveningTimeSafe = null;
    } else if (eveningTime !== undefined) {
      if (typeof eveningTime !== "string" || !HHMM_RE.test(eveningTime)) {
        return NextResponse.json(
          { message: "שעת ערב חייבת להיות בפורמט HH:MM" },
          { status: 400 }
        );
      }
      eveningTimeSafe = eveningTime;
    }

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







