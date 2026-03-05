import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
        adminId: session.user.id,
      },
    });

    return NextResponse.json({ announcement });
  } catch (error) {
    console.error("Update announcement error:", error);
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
        adminId: session.user.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete announcement error:", error);
    return NextResponse.json(
      { message: "שגיאה במחיקת ההודעה" },
      { status: 500 }
    );
  }
}
