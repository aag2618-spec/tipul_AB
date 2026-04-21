import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

/**
 * POST /api/admin/users/[id]/toggle-block
 * Toggle user block status. עטוף ב-withAudit כדי שחסימה/שחרור תירשם
 * ב-AdminAuditLog בדיוק כמו PATCH של users/[id] (Patch 1.8.1).
 */
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("users.block");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;

    // קריאה נוכחית של isBlocked (מחוץ ל-tx כדי לא להחזיק lock מיותר)
    const user = await prisma.user.findUnique({
      where: { id },
      select: { isBlocked: true },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    const newBlockedState = !user.isBlocked;

    const updatedUser = await withAudit(
      { kind: "user", session },
      {
        action: newBlockedState ? "block_user" : "unblock_user",
        targetType: "user",
        targetId: id,
        details: {
          previousState: user.isBlocked,
          newState: newBlockedState,
        },
      },
      async (tx) =>
        tx.user.update({
          where: { id },
          data: { isBlocked: newBlockedState },
          select: {
            id: true,
            name: true,
            isBlocked: true,
          },
        })
    );

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    logger.error("Error toggling user block:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בחסימת/שחרור המשתמש" },
      { status: 500 }
    );
  }
}
