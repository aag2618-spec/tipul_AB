import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isShabbatOrYomTov } from "@/lib/shabbat";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    // בשבת/חג — מחזירים רשימה ריקה. הנוטיפיקציות נשמרות ב-DB ויופיעו במוצ"ש.
    if (isShabbatOrYomTov()) {
      return NextResponse.json({
        notifications: [],
        unreadCount: 0,
        isShabbat: true,
      });
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const limit = parseInt(searchParams.get("limit") || "50");
    const typeFilter = searchParams.get("type"); // e.g. "EMAIL_RECEIVED"

    const where: Record<string, unknown> = {
      userId,
      ...(unreadOnly ? { status: { in: ["PENDING", "SENT"] as ("PENDING" | "SENT")[] } } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
    };

    const unreadWhere: Record<string, unknown> = {
      userId,
      status: { in: ["PENDING", "SENT"] as ("PENDING" | "SENT")[] },
      ...(typeFilter ? { type: typeFilter } : {}),
    };

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: unreadWhere,
      }),
    ]);

    // Transform to expected format
    const formattedNotifications = notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      content: n.content,
      status: n.status,
      read: n.status === "READ" || n.status === "DISMISSED",
      createdAt: n.createdAt.toISOString(),
    }));

    return NextResponse.json({
      notifications: formattedNotifications,
      unreadCount,
    });
  } catch (error) {
    logger.error("Get notifications error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת ההתראות" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { type, title, content } = await request.json();

    if (!title || !content) {
      return NextResponse.json({ message: "חסרים שדות חובה" }, { status: 400 });
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        type: type || "CUSTOM",
        title,
        content,
        status: "PENDING",
        sentAt: new Date(),
      },
    });

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    logger.error("Create notification error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת התראה" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const body = await request.json();
    const { id, status, markAllAsRead } = body;

    if (markAllAsRead) {
      await prisma.notification.updateMany({
        where: {
          userId,
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
    logger.error("Update notification error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון ההתראה" },
      { status: 500 }
    );
  }
}
