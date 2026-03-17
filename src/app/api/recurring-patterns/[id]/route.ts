import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.recurringPattern.findFirst({
      where: { id, userId: userId },
    });

    if (!existing) {
      return NextResponse.json({ message: "תבנית לא נמצאה" }, { status: 404 });
    }

    const pattern = await prisma.recurringPattern.update({
      where: { id },
      data: {
        dayOfWeek: body.dayOfWeek ?? existing.dayOfWeek,
        time: body.time ?? existing.time,
        duration: body.duration ?? existing.duration,
        clientId: body.clientId !== undefined ? body.clientId : existing.clientId,
        isActive: body.isActive ?? existing.isActive,
      },
    });

    return NextResponse.json(pattern);
  } catch (error) {
    logger.error("Update recurring pattern error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון התבנית" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    const existing = await prisma.recurringPattern.findFirst({
      where: { id, userId: userId },
    });

    if (!existing) {
      return NextResponse.json({ message: "תבנית לא נמצאה" }, { status: 404 });
    }

    await prisma.recurringPattern.delete({ where: { id } });

    return NextResponse.json({ message: "התבנית נמחקה בהצלחה" });
  } catch (error) {
    logger.error("Delete recurring pattern error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת התבנית" },
      { status: 500 }
    );
  }
}







