import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { invalidateJwtCache } from "@/lib/auth";
import { parseBody } from "@/lib/validations/helpers";
import { setAdminSchema } from "@/lib/validations/admin";

/**
 * API endpoint to set a user as admin
 * Only accessible by existing admins
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("users.change_role");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const parsed = await parseBody(request, setAdminSchema);
    if ("error" in parsed) return parsed.error;
    const { email } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { message: "משתמש לא נמצא" },
        { status: 404 }
      );
    }

    if (user.role === "ADMIN") {
      return NextResponse.json(
        { message: "המשתמש כבר מנהל" },
        { status: 400 }
      );
    }

    const updatedUser = await withAudit(
      { kind: "user", session },
      {
        action: "set_admin",
        targetType: "user",
        targetId: user.id,
        details: {
          email: user.email,
          previousRole: user.role,
          newRole: "ADMIN",
        },
      },
      async (tx) =>
        tx.user.update({
          where: { id: user.id },
          data: { role: "ADMIN" },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        })
    );

    // H2: ה-token של המשתמש יקבל role: ADMIN בקריאה הבאה במקום אחרי 30s.
    invalidateJwtCache(user.id);

    return NextResponse.json({
      message: "המשתמש הוגדר כמנהל בהצלחה",
      user: updatedUser,
    });
  } catch (error) {
    logger.error("Set admin error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה" },
      { status: 500 }
    );
  }
}

