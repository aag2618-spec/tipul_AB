import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    // Find the communication log and verify ownership
    const log = await prisma.communicationLog.findFirst({
      where: {
        id,
        userId: session.user.id,
        type: "INCOMING_EMAIL",
      },
    });

    if (!log) {
      return NextResponse.json(
        { message: "הודעה לא נמצאה" },
        { status: 404 }
      );
    }

    // Mark as read
    await prisma.communicationLog.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json({ message: "סומן כנקרא בהצלחה" });
  } catch (error) {
    console.error("Mark as read error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון ההודעה" },
      { status: 500 }
    );
  }
}
