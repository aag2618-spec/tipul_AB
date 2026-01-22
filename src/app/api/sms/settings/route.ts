import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const settings = await prisma.sMSSettings.findUnique({
      where: { therapistId: session.user.id },
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
    console.error("Get SMS settings error:", error);
    return NextResponse.json(
      { error: "שגיאה בטעינת ההגדרות" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { enabled, hoursBeforeReminder, customMessage, sendOnWeekends } = body;

    const settings = await prisma.sMSSettings.upsert({
      where: { therapistId: session.user.id },
      update: {
        enabled,
        hoursBeforeReminder,
        customMessage,
        sendOnWeekends,
      },
      create: {
        therapistId: session.user.id,
        enabled,
        hoursBeforeReminder,
        customMessage,
        sendOnWeekends,
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Update SMS settings error:", error);
    return NextResponse.json(
      { error: "שגיאה בשמירת ההגדרות" },
      { status: 500 }
    );
  }
}
