import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.announcements");
    if ("error" in auth) return auth.error;

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
    logger.error("Get announcements error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת ההודעות" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.announcements");
    if ("error" in auth) return auth.error;
    const { userId } = auth;

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
        adminId: userId,
      },
    });

    return NextResponse.json({ announcement }, { status: 201 });
  } catch (error) {
    logger.error("Create announcement error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת ההודעה" },
      { status: 500 }
    );
  }
}
