import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Create test notification - for testing only
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const notification = await prisma.notification.create({
      data: {
        userId: session.user.id,
        type: "SESSION_REMINDER",
        title: "התראת בדיקה",
        content: "זוהי התראה לבדיקה שהמערכת עובדת",
        status: "PENDING",
      },
    });

    return NextResponse.json({ success: true, notification });
  } catch (error) {
    console.error("Create test notification error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת ההתראה" },
      { status: 500 }
    );
  }
}
