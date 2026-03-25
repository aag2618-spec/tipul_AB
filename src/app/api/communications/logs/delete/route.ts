import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const body = await request.json().catch(() => null);
    const rawIds = body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ message: "חסרים מזהי הודעות" }, { status: 400 });
    }

    const ids = rawIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
    if (ids.length === 0) {
      return NextResponse.json({ message: "מזהים לא תקינים" }, { status: 400 });
    }

    const result = await prisma.communicationLog.deleteMany({
      where: {
        id: { in: ids },
        userId,
      },
    });

    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error) {
    logger.error("Delete communication logs error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה במחיקה" }, { status: 500 });
  }
}
