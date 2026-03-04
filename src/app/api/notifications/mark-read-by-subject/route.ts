import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { subject } = await request.json();

    if (!subject) {
      return NextResponse.json({ message: "חסר נושא" }, { status: 400 });
    }

    // Mark notifications as read where the content contains the subject
    await prisma.notification.updateMany({
      where: {
        userId: session.user.id,
        type: "EMAIL_RECEIVED",
        status: { in: ["PENDING", "SENT"] },
        content: { contains: subject },
      },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mark notifications by subject error:", error);
    return NextResponse.json(
      { message: "שגיאה" },
      { status: 500 }
    );
  }
}
