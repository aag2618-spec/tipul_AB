import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser, buildClientWhere } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    // H16.1 (סבב 16c): scope-aware update — אותו תיקון כמו ב-read/route.ts.
    // משתמש שעבר קליניקה לא יכול לבטל logs ישנים מה-scope הקודם.
    const scopeUser = await loadScopeUserWithMode(userId);
    const clientWhere = buildClientWhere(scopeUser);

    await prisma.communicationLog.updateMany({
      where: {
        id,
        status: "FAILED",
        OR: [
          { userId: userId },
          { client: clientWhere },
        ],
      },
      data: {
        status: "DISMISSED",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Dismiss failed message error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה" },
      { status: 500 }
    );
  }
}
