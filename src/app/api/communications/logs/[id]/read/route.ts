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

    // H16.1 (סבב 16c): scope-aware update. בעבר ה-where היה `{id, userId}`
    // בלבד — אם משתמש יצר log ואז עבר לקליניקה אחרת, הוא עדיין יכול לסמן
    // logs ישנים שאינם בscope שלו. עכשיו: OR בין creator (userId) ל-client
    // בscope הנוכחי — אותו pattern כמו `uploads/[...path]/route.ts:103-110`.
    const scopeUser = await loadScopeUserWithMode(userId);
    const clientWhere = buildClientWhere(scopeUser);

    await prisma.communicationLog.updateMany({
      where: {
        id,
        isRead: false,
        OR: [
          { userId: userId },
          { client: clientWhere },
        ],
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Mark communication as read error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה" },
      { status: 500 }
    );
  }
}
