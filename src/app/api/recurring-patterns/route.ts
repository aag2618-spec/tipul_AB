import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser, buildClientWhere } from "@/lib/scope";
import { parseBody } from "@/lib/validations/helpers";
import { createRecurringPatternSchema } from "@/lib/validations/recurring-pattern";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const patterns = await prisma.recurringPattern.findMany({
      where: { userId: userId },
      include: {
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ dayOfWeek: "asc" }, { time: "asc" }],
    });

    return NextResponse.json(patterns);
  } catch (error) {
    logger.error("Get recurring patterns error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת התבניות" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const parsed = await parseBody(request, createRecurringPatternSchema);
    if ("error" in parsed) return parsed.error;
    const { dayOfWeek, time, duration, clientId } = parsed.data;

    // M-IDOR: clientId חייב להיות ב-scope של המשתמש לפני קישור pattern.
    if (clientId) {
      const scopeUser = await loadScopeUser(userId);
      const exists = await prisma.client.findFirst({
        where: { AND: [{ id: clientId }, buildClientWhere(scopeUser)] },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
      }
    }

    const pattern = await prisma.recurringPattern.create({
      data: {
        userId: userId,
        dayOfWeek,
        time,
        duration: duration ?? 50,
        clientId: clientId || null,
        isActive: true,
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(pattern, { status: 201 });
  } catch (error) {
    logger.error("Create recurring pattern error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת התבנית" },
      { status: 500 }
    );
  }
}







