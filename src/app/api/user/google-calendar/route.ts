import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isGoogleCalendarConnected } from "@/lib/google-calendar";
import prisma from "@/lib/prisma";

// GET - Check if Google Calendar is connected
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const isConnected = await isGoogleCalendarConnected(session.user.id);
    
    // Get account info if connected
    let accountEmail = null;
    if (isConnected) {
      const account = await prisma.account.findFirst({
        where: {
          userId: session.user.id,
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
    console.error("Check Google Calendar connection error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה" },
      { status: 500 }
    );
  }
}

// DELETE - Disconnect Google Calendar
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    // Delete Google account connection
    await prisma.account.deleteMany({
      where: {
        userId: session.user.id,
        provider: 'google',
      },
    });

    return NextResponse.json({
      success: true,
      message: "החיבור ל-Google Calendar נותק בהצלחה",
    });
  } catch (error) {
    console.error("Disconnect Google Calendar error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בניתוק החיבור" },
      { status: 500 }
    );
  }
}
