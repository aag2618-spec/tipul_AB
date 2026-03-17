import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAdmin } from "@/lib/api-auth";

/**
 * API endpoint to set a user as admin
 * Only accessible by existing admins
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { message: "נא לספק כתובת אימייל" },
        { status: 400 }
      );
    }

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

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

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

