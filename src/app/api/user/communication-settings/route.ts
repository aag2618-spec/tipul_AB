import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/user/communication-settings
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const settings = await prisma.communicationSetting.findUnique({
      where: { userId: session.user.id },
    });

    if (!settings) {
      // Return default settings if none exist
      return NextResponse.json({
        settings: {
          sendConfirmationEmail: true,
          send24hReminder: true,
          send2hReminder: false,
          allowClientCancellation: true,
          minCancellationHours: 24,
          sendDebtReminders: false,
          debtReminderDayOfMonth: 1,
          debtReminderMinAmount: 50,
          sendPaymentReceipt: false,
        },
      });
    }

    return NextResponse.json({
      settings: {
        sendConfirmationEmail: settings.sendConfirmationEmail,
        send24hReminder: settings.send24hReminder,
        send2hReminder: settings.send2hReminder,
        allowClientCancellation: settings.allowClientCancellation,
        minCancellationHours: settings.minCancellationHours,
        sendDebtReminders: settings.sendDebtReminders,
        debtReminderDayOfMonth: settings.debtReminderDayOfMonth,
        debtReminderMinAmount: Number(settings.debtReminderMinAmount),
        sendPaymentReceipt: settings.sendPaymentReceipt,
      },
    });
  } catch (error) {
    console.error("Get communication settings error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת ההגדרות" },
      { status: 500 }
    );
  }
}

// PUT /api/user/communication-settings
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const {
      sendConfirmationEmail,
      send24hReminder,
      send2hReminder,
      allowClientCancellation,
      minCancellationHours,
      sendDebtReminders,
      debtReminderDayOfMonth,
      debtReminderMinAmount,
      sendPaymentReceipt,
    } = body;

    // Validate minCancellationHours
    const validMinHours = Math.max(1, Math.min(168, minCancellationHours || 24));
    
    // Validate debtReminderDayOfMonth (1-28)
    const validDayOfMonth = Math.max(1, Math.min(28, debtReminderDayOfMonth || 1));
    
    // Validate debtReminderMinAmount (0+)
    const validMinAmount = Math.max(0, debtReminderMinAmount || 50);

    const settings = await prisma.communicationSetting.upsert({
      where: { userId: session.user.id },
      update: {
        sendConfirmationEmail: sendConfirmationEmail ?? true,
        send24hReminder: send24hReminder ?? true,
        send2hReminder: send2hReminder ?? false,
        allowClientCancellation: allowClientCancellation ?? true,
        minCancellationHours: validMinHours,
        sendDebtReminders: sendDebtReminders ?? false,
        debtReminderDayOfMonth: validDayOfMonth,
        debtReminderMinAmount: validMinAmount,
        sendPaymentReceipt: sendPaymentReceipt ?? false,
      },
      create: {
        userId: session.user.id,
        sendConfirmationEmail: sendConfirmationEmail ?? true,
        send24hReminder: send24hReminder ?? true,
        send2hReminder: send2hReminder ?? false,
        allowClientCancellation: allowClientCancellation ?? true,
        minCancellationHours: validMinHours,
        sendDebtReminders: sendDebtReminders ?? false,
        debtReminderDayOfMonth: validDayOfMonth,
        debtReminderMinAmount: validMinAmount,
        sendPaymentReceipt: sendPaymentReceipt ?? false,
      },
    });

    return NextResponse.json({
      success: true,
      settings: {
        sendConfirmationEmail: settings.sendConfirmationEmail,
        send24hReminder: settings.send24hReminder,
        send2hReminder: settings.send2hReminder,
        allowClientCancellation: settings.allowClientCancellation,
        minCancellationHours: settings.minCancellationHours,
        sendDebtReminders: settings.sendDebtReminders,
        debtReminderDayOfMonth: settings.debtReminderDayOfMonth,
        debtReminderMinAmount: Number(settings.debtReminderMinAmount),
        sendPaymentReceipt: settings.sendPaymentReceipt,
      },
    });
  } catch (error) {
    console.error("Update communication settings error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בשמירת ההגדרות" },
      { status: 500 }
    );
  }
}
