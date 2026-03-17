import { NextResponse } from "next/server";
import { isGoogleCalendarConnected } from "@/lib/google-calendar";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

// GET - Check if Google Calendar is connected
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const isConnected = await isGoogleCalendarConnected(userId);
    
    // Get account info if connected
    let accountEmail = null;
    if (isConnected) {
      const account = await prisma.account.findFirst({
        where: {
          userId: userId,
          provider: 'google',
        },
        include: {
          user: {
            select: { email: true },
          },
        },
      });
      accountEmail = account?.user?.email;
    }

    return NextResponse.json({
      connected: isConnected,
      email: accountEmail,
    });
  } catch (error) {
    logger.error("Check Google Calendar connection error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה" },
      { status: 500 }
    );
  }
}

// DELETE - Disconnect Google Calendar
export async function DELETE() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    // Delete Google account connection
    await prisma.account.deleteMany({
      where: {
        userId: userId,
        provider: 'google',
      },
    });

    return NextResponse.json({
      success: true,
      message: "החיבור ל-Google Calendar נותק בהצלחה",
    });
  } catch (error) {
    logger.error("Disconnect Google Calendar error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בניתוק החיבור" },
      { status: 500 }
    );
  }
}
