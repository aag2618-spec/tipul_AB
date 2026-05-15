import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { parseBody } from "@/lib/validations/helpers";
import { createAnnouncementSchema } from "@/lib/validations/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.announcements");
    if ("error" in auth) return auth.error;

    const announcements = await prisma.systemAnnouncement.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { dismissals: true },
        },
      },
    });

    const now = new Date();
    const enriched = announcements.map((a) => ({
      ...a,
      dismissalCount: a._count.dismissals,
      status: !a.isActive
        ? "inactive"
        : a.expiresAt && a.expiresAt < now
          ? "expired"
          : "active",
    }));

    return NextResponse.json({ announcements: enriched });
  } catch (error) {
    logger.error("Get announcements error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת ההודעות" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.announcements");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const parsed = await parseBody(req, createAnnouncementSchema);
    if ("error" in parsed) return parsed.error;
    const { title, content, type, expiresAt, showBanner } = parsed.data;

    const announcement = await withAudit(
      { kind: "user", session },
      {
        action: "create_announcement",
        targetType: "announcement",
        details: { title, type: type || "info" },
      },
      async (tx) => {
        const created = await tx.systemAnnouncement.create({
          data: {
            title,
            content,
            type: type || "info",
            isActive: true,
            showBanner: showBanner !== false,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          },
        });
        return created;
      }
    );

    return NextResponse.json({ announcement }, { status: 201 });
  } catch (error) {
    logger.error("Create announcement error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת ההודעה" },
      { status: 500 }
    );
  }
}
