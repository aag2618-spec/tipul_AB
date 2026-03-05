import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const announcements = await prisma.systemAnnouncement.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { dismissals: true },
        },
      },
    });

    const now = new Date();
    const enriched = announcements.map((a) => ({
      ...a,
      dismissalCount: a._count.dismissals,
      status: !a.isActive
        ? "inactive"
        : a.expiresAt && a.expiresAt < now
          ? "expired"
          : "active",
    }));

    return NextResponse.json({ announcements: enriched });
  } catch (error) {
    console.error("Get announcements error:", error);
    return NextResponse.json(
      { message: "שגיאה בטעינת ההודעות" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const body = await req.json();
    const { title, content, type, expiresAt, showBanner } = body;

    if (!title || !content) {
      return NextResponse.json(
        { message: "כותרת ותוכן הם שדות חובה" },
        { status: 400 }
      );
    }

    const announcement = await prisma.systemAnnouncement.create({
      data: {
        title,
        content,
        type: type || "info",
        isActive: true,
        showBanner: showBanner !== false,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    await prisma.adminAuditLog.create({
      data: {
        action: "create_announcement",
        targetType: "announcement",
        targetId: announcement.id,
        details: JSON.stringify({ title, type }),
        adminId: session.user.id,
      },
    });

    return NextResponse.json({ announcement }, { status: 201 });
  } catch (error) {
    console.error("Create announcement error:", error);
    return NextResponse.json(
      { message: "שגיאה ביצירת ההודעה" },
      { status: 500 }
    );
  }
}
