import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseIsraelTime } from "@/lib/date-utils";
import { requireAuth } from "@/lib/api-auth";
import { buildSessionWhere, loadScopeUser } from "@/lib/scope";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const scopeUser = await loadScopeUser(userId);
    const scopeWhere = buildSessionWhere(scopeUser);

    const extraConditions: Prisma.TherapySessionWhereInput = {};
    if (startDate && endDate) {
      const rangeStart = parseIsraelTime(startDate);
      const rangeEnd = parseIsraelTime(endDate);
      extraConditions.AND = [
        { startTime: { lt: rangeEnd } },
        { endTime: { gt: rangeStart } },
      ];
    }

    const sessions = await prisma.therapySession.findMany({
      where: { AND: [scopeWhere, extraConditions] },
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        type: true,
        price: true,
        client: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    logger.error("Calendar sessions error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ message: "שגיאה בטעינת הפגישות" }, { status: 500 });
  }
}
