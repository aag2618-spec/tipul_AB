import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAdmin } from "@/lib/api-auth";

/**
 * POST /api/admin/users/[id]/toggle-block
 * Toggle user block status
 */
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const { id: userId } = await params;

    // Get current status
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isBlocked: true },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Toggle
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isBlocked: !user.isBlocked },
      select: {
        id: true,
        name: true,
        isBlocked: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    logger.error("Error toggling user block:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to toggle block status" },
      { status: 500 }
    );
  }
}
