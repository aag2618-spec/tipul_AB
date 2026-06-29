import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser, buildClientWhere } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { parseBody } from "@/lib/validations/helpers";
import { updateRecurringPatternSchema } from "@/lib/validations/recurring-pattern";

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

    const parsed = await parseBody(request, updateRecurringPatternSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;

    const existing = await prisma.recurringPattern.findFirst({
      where: { id, userId: userId },
    });

    if (!existing) {
      return NextResponse.json({ message: "תבנית לא נמצאה" }, { status: 404 });
    }

    // M-validation: שדות חסרים יורשו מ-existing; אם נשלחו — כבר אומתו ב-zod.
    const finalDayOfWeek = body.dayOfWeek ?? existing.dayOfWeek;
    const finalTime = body.time ?? existing.time;
    const finalDuration = body.duration ?? existing.duration;
    const finalClientId =
      body.clientId !== undefined ? body.clientId : existing.clientId;

    // M-IDOR: אם clientId השתנה (או נשלח) — אימות שייכות ל-scope.
    if (
      body.clientId !== undefined &&
      finalClientId &&
      finalClientId !== existing.clientId
    ) {
      const scopeUser = await loadScopeUserWithMode(userId);
      const exists = await prisma.client.findFirst({
        where: { AND: [{ id: finalClientId }, buildClientWhere(scopeUser)] },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
      }
    }

    // updateMany עם userId ב-WHERE לאטומיות. אם race condition הסיר/העביר
    // ownership בין findFirst ל-כאן — count===0 → 404.
    const updateResult = await prisma.recurringPattern.updateMany({
      where: { id, userId },
      data: {
        dayOfWeek: finalDayOfWeek,
        time: finalTime,
        duration: finalDuration,
        clientId: finalClientId,
        isActive: body.isActive ?? existing.isActive,
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







