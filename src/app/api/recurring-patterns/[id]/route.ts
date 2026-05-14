import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser } from "@/lib/scope";
import { validateRecurringPatternInput } from "@/lib/validation/recurring-pattern";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    let body: Record<string, unknown>;
    try {
      const raw = await request.json();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
      }
      body = raw as Record<string, unknown>;
    } catch {
      return NextResponse.json({ message: "גוף בקשה לא תקין (JSON)" }, { status: 400 });
    }

    const existing = await prisma.recurringPattern.findFirst({
      where: { id, userId: userId },
    });

    if (!existing) {
      return NextResponse.json({ message: "תבנית לא נמצאה" }, { status: 404 });
    }

    // M-validation: רק שדות שנשלחו עוברים validation. שדות חסרים יורשו מ-existing.
    // אם לא נשלח dayOfWeek — לא מאמתים (נשאר existing). אם כן — חייב להיות תקין.
    const fieldsToValidate: Record<string, unknown> = {
      dayOfWeek: body.dayOfWeek ?? existing.dayOfWeek,
      time: body.time ?? existing.time,
      duration: body.duration ?? existing.duration,
      clientId: body.clientId !== undefined ? body.clientId : existing.clientId,
    };
    const scopeUser = await loadScopeUser(userId);
    const err = await validateRecurringPatternInput({
      body: fieldsToValidate,
      scopeUser,
      requireClient: false,
    });
    if (err) return err;

    // updateMany עם userId ב-WHERE לאטומיות. אם race condition הסיר/העביר
    // ownership בין findFirst ל-כאן — count===0 → 404.
    const updateResult = await prisma.recurringPattern.updateMany({
      where: { id, userId },
      data: {
        dayOfWeek: fieldsToValidate.dayOfWeek as number,
        time: fieldsToValidate.time as string,
        duration: fieldsToValidate.duration as number,
        clientId: fieldsToValidate.clientId as string | null,
        isActive: typeof body.isActive === "boolean" ? body.isActive : existing.isActive,
      },
    });
    if (updateResult.count === 0) {
      return NextResponse.json({ message: "תבנית לא נמצאה" }, { status: 404 });
    }
    const pattern = await prisma.recurringPattern.findUnique({ where: { id } });
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







