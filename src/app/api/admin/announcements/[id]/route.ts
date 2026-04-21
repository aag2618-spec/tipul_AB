import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("settings.announcements");
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;
    const body = await req.json();
    const { title, content, type, isActive, showBanner, expiresAt } = body;

    const existing = await prisma.systemAnnouncement.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ message: "הודעה לא נמצאה" }, { status: 404 });
    }

    const announcement = await prisma.systemAnnouncement.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(type !== undefined && { type }),
        ...(isActive !== undefined && { isActive }),
        ...(showBanner !== undefined && { showBanner }),
        ...(expiresAt !== undefined && {
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        }),
      },
    });

    await prisma.adminAuditLog.create({
      data: {
        action: "update_announcement",
        targetType: "announcement",
        targetId: id,
        details: JSON.stringify(body),
        adminId: userId,
      },
    });

    return NextResponse.json({ announcement });
  } catch (error) {
    logger.error("Update announcement error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בעדכון ההודעה" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("settings.announcements");
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const existing = await prisma.systemAnnouncement.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ message: "הודעה לא נמצאה" }, { status: 404 });
    }

    await prisma.systemAnnouncement.delete({
      where: { id },
    });

    await prisma.adminAuditLog.create({
      data: {
        action: "delete_announcement",
        targetType: "announcement",
        targetId: id,
        details: JSON.stringify({ title: existing.title }),
        adminId: userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Delete announcement error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה במחיקת ההודעה" },
      { status: 500 }
    );
  }
}
