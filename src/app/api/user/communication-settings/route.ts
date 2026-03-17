import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET /api/user/communication-settings
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const settings = await prisma.communicationSetting.findUnique({
      where: { userId: userId },
    });

    if (!settings) {
      return NextResponse.json({
        settings: {
          sendConfirmationEmail: true,
          send24hReminder: true,
          send2hReminder: false,
          customReminderEnabled: false,
          customReminderHours: 2,
          allowClientCancellation: true,
          minCancellationHours: 24,
          sendDebtReminders: false,
          debtReminderDayOfMonth: 1,
          debtReminderMinAmount: 50,
          sendPaymentReceipt: false,
          sendReceiptToClient: true,
          sendReceiptToTherapist: false,
          receiptEmailTemplate: null,
          paymentInstructions: null,
          paymentLink: null,
          emailSignature: null,
          logoUrl: null,
          customGreeting: null,
          customClosing: null,
          businessHours: null,
        },
      });
    }

    return NextResponse.json({
      settings: {
        sendConfirmationEmail: settings.sendConfirmationEmail,
        send24hReminder: settings.send24hReminder,
        send2hReminder: settings.send2hReminder,
        customReminderEnabled: settings.customReminderEnabled,
        customReminderHours: settings.customReminderHours,
        allowClientCancellation: settings.allowClientCancellation,
        minCancellationHours: settings.minCancellationHours,
        sendDebtReminders: settings.sendDebtReminders,
        debtReminderDayOfMonth: settings.debtReminderDayOfMonth,
        debtReminderMinAmount: Number(settings.debtReminderMinAmount),
        sendPaymentReceipt: settings.sendPaymentReceipt,
        sendReceiptToClient: settings.sendReceiptToClient,
        sendReceiptToTherapist: settings.sendReceiptToTherapist,
        receiptEmailTemplate: settings.receiptEmailTemplate,
        paymentInstructions: settings.paymentInstructions,
        paymentLink: settings.paymentLink,
        emailSignature: settings.emailSignature,
        logoUrl: settings.logoUrl,
        customGreeting: settings.customGreeting,
        customClosing: settings.customClosing,
        businessHours: settings.businessHours,
      },
    });
  } catch (error) {
    logger.error("Get communication settings error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת ההגדרות" },
      { status: 500 }
    );
  }
}

// PUT /api/user/communication-settings
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const body = await request.json();
    const {
      sendConfirmationEmail,
      send24hReminder,
      send2hReminder,
      customReminderEnabled,
      customReminderHours,
      allowClientCancellation,
      minCancellationHours,
      sendDebtReminders,
      debtReminderDayOfMonth,
      debtReminderMinAmount,
      sendPaymentReceipt,
      sendReceiptToClient,
      sendReceiptToTherapist,
      receiptEmailTemplate,
      paymentInstructions,
      paymentLink,
      emailSignature,
      logoUrl,
      customGreeting,
      customClosing,
      businessHours,
    } = body;

    // Validate customReminderHours (1-72)
    const validCustomHours = Math.max(1, Math.min(72, customReminderHours || 2));
    
    // Validate minCancellationHours
    const validMinHours = Math.max(1, Math.min(168, minCancellationHours || 24));
    
    // Validate debtReminderDayOfMonth (1-28)
    const validDayOfMonth = Math.max(1, Math.min(28, debtReminderDayOfMonth || 1));
    
    // Validate debtReminderMinAmount (0+)
    const validMinAmount = Math.max(0, debtReminderMinAmount || 50);

    const settings = await prisma.communicationSetting.upsert({
      where: { userId: userId },
      update: {
        sendConfirmationEmail: sendConfirmationEmail ?? true,
        send24hReminder: send24hReminder ?? true,
        send2hReminder: send2hReminder ?? false,
        customReminderEnabled: customReminderEnabled ?? false,
        customReminderHours: validCustomHours,
        allowClientCancellation: allowClientCancellation ?? true,
        minCancellationHours: validMinHours,
        sendDebtReminders: sendDebtReminders ?? false,
        debtReminderDayOfMonth: validDayOfMonth,
        debtReminderMinAmount: validMinAmount,
        sendPaymentReceipt: sendPaymentReceipt ?? false,
        sendReceiptToClient: sendReceiptToClient !== undefined ? sendReceiptToClient : undefined,
        sendReceiptToTherapist: sendReceiptToTherapist !== undefined ? sendReceiptToTherapist : undefined,
        receiptEmailTemplate: receiptEmailTemplate !== undefined ? receiptEmailTemplate : undefined,
        paymentInstructions: paymentInstructions !== undefined ? paymentInstructions : undefined,
        paymentLink: paymentLink !== undefined ? paymentLink : undefined,
        emailSignature: emailSignature !== undefined ? emailSignature : undefined,
        logoUrl: logoUrl !== undefined ? logoUrl : undefined,
        customGreeting: customGreeting !== undefined ? customGreeting : undefined,
        customClosing: customClosing !== undefined ? customClosing : undefined,
        businessHours: businessHours !== undefined ? businessHours : undefined,
      },
      create: {
        userId: userId,
        sendConfirmationEmail: sendConfirmationEmail ?? true,
        send24hReminder: send24hReminder ?? true,
        send2hReminder: send2hReminder ?? false,
        customReminderEnabled: customReminderEnabled ?? false,
        customReminderHours: validCustomHours,
        allowClientCancellation: allowClientCancellation ?? true,
        minCancellationHours: validMinHours,
        sendDebtReminders: sendDebtReminders ?? false,
        debtReminderDayOfMonth: validDayOfMonth,
        debtReminderMinAmount: validMinAmount,
        sendPaymentReceipt: sendPaymentReceipt ?? false,
        sendReceiptToClient: sendReceiptToClient ?? true,
        sendReceiptToTherapist: sendReceiptToTherapist ?? false,
        receiptEmailTemplate: receiptEmailTemplate || null,
        paymentInstructions: paymentInstructions || null,
        paymentLink: paymentLink || null,
        emailSignature: emailSignature || null,
        logoUrl: logoUrl || null,
        customGreeting: customGreeting || null,
        customClosing: customClosing || null,
        businessHours: businessHours || null,
      },
    });

    return NextResponse.json({
      success: true,
      settings: {
        sendConfirmationEmail: settings.sendConfirmationEmail,
        send24hReminder: settings.send24hReminder,
        send2hReminder: settings.send2hReminder,
        customReminderEnabled: settings.customReminderEnabled,
        customReminderHours: settings.customReminderHours,
        allowClientCancellation: settings.allowClientCancellation,
        minCancellationHours: settings.minCancellationHours,
        sendDebtReminders: settings.sendDebtReminders,
        debtReminderDayOfMonth: settings.debtReminderDayOfMonth,
        debtReminderMinAmount: Number(settings.debtReminderMinAmount),
        sendPaymentReceipt: settings.sendPaymentReceipt,
        sendReceiptToClient: settings.sendReceiptToClient,
        sendReceiptToTherapist: settings.sendReceiptToTherapist,
        receiptEmailTemplate: settings.receiptEmailTemplate,
        paymentInstructions: settings.paymentInstructions,
        paymentLink: settings.paymentLink,
        emailSignature: settings.emailSignature,
        logoUrl: settings.logoUrl,
        customGreeting: settings.customGreeting,
        customClosing: settings.customClosing,
        businessHours: settings.businessHours,
      },
    });
  } catch (error) {
    logger.error("Update communication settings error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בשמירת ההגדרות" },
      { status: 500 }
    );
  }
}
