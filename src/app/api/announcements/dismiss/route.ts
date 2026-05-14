import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { dismissAnnouncementSchema } from "@/lib/validations/communications";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const parsed = await parseBody(req, dismissAnnouncementSchema);
    if ("error" in parsed) return parsed.error;
    const { announcementId } = parsed.data;

    const announcement = await prisma.systemAnnouncement.findUnique({
      where: { id: announcementId },
    });

    if (!announcement) {
      return NextResponse.json({ message: "הודעה לא נמצאה" }, { status: 404 });
    }

    await prisma.announcementDismissal.upsert({
      where: {
        announcementId_userId: {
          announcementId,
          userId: userId,
        },
      },
      update: {},
      create: {
        announcementId,
        userId: userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Dismiss announcement error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בדחיית ההודעה" },
      { status: 500 }
    );
  }
}
