import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    const recording = await prisma.recording.findFirst({
      where: {
        id,
        OR: [
          { client: { therapistId: userId } },
          { session: { therapistId: userId } },
        ],
      },
      include: {
        client: true,
        session: {
          include: {
            client: { select: { id: true, name: true } },
          },
        },
        transcription: {
          include: { analysis: true },
        },
      },
    });

    if (!recording) {
      return NextResponse.json({ message: "הקלטה לא נמצאה" }, { status: 404 });
    }

    return NextResponse.json(recording);
  } catch (error) {
    logger.error("Get recording error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת ההקלטה" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    const recording = await prisma.recording.findFirst({
      where: {
        id,
        OR: [
          { client: { therapistId: userId } },
          { session: { therapistId: userId } },
        ],
      },
    });

    if (!recording) {
      return NextResponse.json({ message: "הקלטה לא נמצאה" }, { status: 404 });
    }

    await prisma.recording.delete({ where: { id } });

    return NextResponse.json({ message: "ההקלטה נמחקה בהצלחה" });
  } catch (error) {
    logger.error("Delete recording error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת ההקלטה" },
      { status: 500 }
    );
  }
}













