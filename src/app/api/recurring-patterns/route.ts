import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

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
    const { userId, session } = auth;

    const body = await request.json();
    const { dayOfWeek, time, duration, clientId } = body;

    const pattern = await prisma.recurringPattern.create({
      data: {
        userId: userId,
        dayOfWeek,
        time,
        duration: duration || 50,
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







