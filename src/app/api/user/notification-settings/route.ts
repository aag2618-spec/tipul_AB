import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const settings = await prisma.notificationSetting.findMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Get notification settings error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת ההגדרות" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { emailEnabled, pushEnabled, morningTime, eveningTime, debtThresholdDays, monthlyReminderDay } = body;

    // Update or create email settings
    const existingEmail = await prisma.notificationSetting.findFirst({
      where: { userId: session.user.id, channel: "email" },
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
          userId: session.user.id,
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
      where: { userId: session.user.id, channel: "push" },
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
          userId: session.user.id,
          channel: "push",
          enabled: pushEnabled,
          morningTime,
          eveningTime,
          debtThresholdDays,
        },
      });
    }

    const settings = await prisma.notificationSetting.findMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Update notification settings error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון ההגדרות" },
      { status: 500 }
    );
  }
}







