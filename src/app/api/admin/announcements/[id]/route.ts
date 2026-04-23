import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// DELETE = ADMIN only (אין שינוי, רק מחיקה שלמה של הודעה)
// PUT = MANAGER + ADMIN (settings.announcements)

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("settings.announcements");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const body = await req.json();
    const { title, content, type, isActive, showBanner, expiresAt } = body;

    const existing = await prisma.systemAnnouncement.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ message: "הודעה לא נמצאה" }, { status: 404 });
    }

    const announcement = await withAudit(
      { kind: "user", session },
      {
        action: "update_announcement",
        targetType: "announcement",
        targetId: id,
        details: { patch: body },
      },
      async (tx) =>
        tx.systemAnnouncement.update({
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
        })
    );

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
    // announcements.delete = ADMIN בלבד (matrix #51).
    // MANAGER יכול ליצור/לעדכן דרך settings.announcements אבל לא למחוק.
    const auth = await requirePermission("announcements.delete");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;

    const existing = await prisma.systemAnnouncement.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ message: "הודעה לא נמצאה" }, { status: 404 });
    }

    await withAudit(
      { kind: "user", session },
      {
        action: "delete_announcement",
        targetType: "announcement",
        targetId: id,
        details: { title: existing.title },
      },
      async (tx) => {
        await tx.systemAnnouncement.delete({
          where: { id },
        });
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Delete announcement error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה במחיקת ההודעה" },
      { status: 500 }
    );
  }
}
