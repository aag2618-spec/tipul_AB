import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

/**
 * POST /api/admin/users/[id]/toggle-block
 * Toggle user block status. עטוף ב-withAudit כדי שחסימה/שחרור תירשם
 * ב-AdminAuditLog בדיוק כמו PATCH של users/[id] (Patch 1.8.1).
 *
 * Body אופציונלי: `{ blockReason: "DEBT" | "TOS_VIOLATION" | "MANUAL" }`.
 * אם חוסמים בלי לציין סיבה — ברירת מחדל MANUAL (נשמר חסום עד החלטה ידנית
 * של אדמין; webhooks לא ישחררו אוטומטית). השחרור תמיד מנקה את שדות הסיבה.
 */
export const dynamic = "force-dynamic";

const VALID_BLOCK_REASONS = ["DEBT", "TOS_VIOLATION", "MANUAL"] as const;
type ValidBlockReason = typeof VALID_BLOCK_REASONS[number];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("users.block");
    if ("error" in auth) return auth.error;
    const { session } = auth;
    const isAdmin = session.user.role === "ADMIN";

    const { id } = await params;

    // body אופציונלי — UIs ישנים שולחים POST ריק; חדשים שולחים { blockReason }.
    let blockReason: ValidBlockReason = "MANUAL";
    try {
      const body = (await req.json()) as { blockReason?: string };
      if (
        body?.blockReason &&
        VALID_BLOCK_REASONS.includes(body.blockReason as ValidBlockReason)
      ) {
        blockReason = body.blockReason as ValidBlockReason;
      }
    } catch {
      // body ריק — נשארים עם MANUAL
    }

    // קריאה נוכחית של isBlocked (מחוץ ל-tx כדי לא להחזיק lock מיותר)
    const user = await prisma.user.findUnique({
      where: { id },
      select: { isBlocked: true },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    const newBlockedState = !user.isBlocked;

    // MANAGER guard — אותה מדיניות כמו ב-PATCH /api/admin/users/[id]:
    // MANAGER יכול לחסום רק על DEBT (שמשתחרר אוטומטית בתשלום). חסימה דביקה
    // (TOS_VIOLATION/MANUAL) דורשת ADMIN — מונע bypass של ה-PATCH guard דרך
    // ה-route הזה. שחרור — מותר ל-MANAGER ללא הגבלה.
    if (newBlockedState && !isAdmin && blockReason !== "DEBT") {
      return NextResponse.json(
        {
          message:
            "מזכיר יכול לחסום רק על חוב פתוח (DEBT). חסימת ToS/ידנית דורשת אדמין",
        },
        { status: 403 }
      );
    }

    const updatedUser = await withAudit(
      { kind: "user", session },
      {
        action: newBlockedState ? "block_user" : "unblock_user",
        targetType: "user",
        targetId: id,
        details: {
          previousState: user.isBlocked,
          newState: newBlockedState,
          ...(newBlockedState && { blockReason }),
        },
      },
      async (tx) =>
        tx.user.update({
          where: { id },
          data: newBlockedState
            ? {
                isBlocked: true,
                blockReason,
                blockedAt: new Date(),
                blockedBy: session.user.id,
              }
            : {
                isBlocked: false,
                blockReason: null,
                blockedAt: null,
                blockedBy: null,
              },
          select: {
            id: true,
            name: true,
            isBlocked: true,
            blockReason: true,
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
