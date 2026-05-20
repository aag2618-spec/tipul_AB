import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser, buildClientWhere } from "@/lib/scope";

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

    // H16.1 (סבב 16c-fix): scope-aware findFirst. בעבר רק `userId: userId` —
    // משתמש שעבר קליניקה (org change) יכול היה לסמן INCOMING logs ישנים
    // שאינם בscope הנוכחי. עכשיו: OR בין creator ל-client בscope.
    // אותו pattern כמו communications/logs/[id]/{read,dismiss}/route.ts.
    const scopeUser = await loadScopeUser(userId);
    const clientWhere = buildClientWhere(scopeUser);

    // Find the communication log and verify ownership
    const log = await prisma.communicationLog.findFirst({
      where: {
        id,
        type: { in: ["INCOMING_EMAIL", "INCOMING_SMS"] },
        OR: [
          { userId: userId },
          { client: clientWhere },
        ],
      },
    });

    if (!log) {
      return NextResponse.json(
        { message: "הודעה לא נמצאה" },
        { status: 404 }
      );
    }

    // Mark as read
    await prisma.communicationLog.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json({ message: "סומן כנקרא בהצלחה" });
  } catch (error) {
    logger.error("Mark as read error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון ההודעה" },
      { status: 500 }
    );
  }
}
