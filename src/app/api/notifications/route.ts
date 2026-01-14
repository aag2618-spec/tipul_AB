import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "20");

    const notifications = await prisma.notification.findMany({
      where: {
        userId: session.user.id,
        ...(status ? { status: status as "PENDING" | "SENT" | "READ" | "DISMISSED" } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(notifications);
  } catch (error) {
    console.error("Get notifications error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת ההתראות" },
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
    const { id, status, markAllAsRead } = body;

    if (markAllAsRead) {
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
      return NextResponse.json({ message: "כל ההתראות סומנו כנקראו" });
    }

    if (id && status) {
      const notification = await prisma.notification.update({
        where: { id },
        data: {
          status,
          readAt: status === "READ" ? new Date() : undefined,
        },
      });
      return NextResponse.json(notification);
    }

    return NextResponse.json({ message: "פרמטרים חסרים" }, { status: 400 });
  } catch (error) {
    console.error("Update notification error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון ההתראה" },
      { status: 500 }
    );
  }
}







