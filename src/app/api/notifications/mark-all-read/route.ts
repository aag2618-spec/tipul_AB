import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    await prisma.notification.updateMany({
      where: {
        userId: session.user.id,
        status: { in: ["PENDING", "SENT"] },
      },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, message: "כל ההתראות סומנו כנקראו" });
  } catch (error) {
    console.error("Mark all as read error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון ההתראות" },
      { status: 500 }
    );
  }
}
