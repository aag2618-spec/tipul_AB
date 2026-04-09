import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const client = await prisma.client.findFirst({
      where: { id, therapistId: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        therapySessions: {
          where: {
            sessionNote: { isNot: null },
          },
          orderBy: { startTime: "asc" },
          include: {
            sessionNote: {
              select: {
                id: true,
                content: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(client);
  } catch (error) {
    logger.error("Get client summaries error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת הסיכומים" },
      { status: 500 }
    );
  }
}
