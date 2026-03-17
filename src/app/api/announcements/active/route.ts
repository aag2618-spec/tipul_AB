import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const now = new Date();

    const announcements = await prisma.systemAnnouncement.findMany({
      where: {
        isActive: true,
        showBanner: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        dismissals: {
          none: {
            userId: userId,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ announcements });
  } catch (error) {
    logger.error("Get active announcements error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת ההודעות" },
      { status: 500 }
    );
  }
}
