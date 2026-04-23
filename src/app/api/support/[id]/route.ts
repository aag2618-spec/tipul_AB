// API: פנייה בודדת — צד משתמש
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET — פנייה בודדת עם תגובות
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;
    const { id } = await params;

    const ticket = await prisma.supportTicket.findFirst({
      where: { id, userId },
      include: {
        responses: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            message: true,
            attachments: true,
            isAdmin: true,
            createdAt: true,
            author: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ message: "פנייה לא נמצאה" }, { status: 404 });
    }

    return NextResponse.json({ ticket });
  } catch (error) {
    logger.error("[Support] Error fetching ticket:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה" }, { status: 500 });
  }
}
