import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;
    const { content } = await request.json();

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { message: "תוכן התמלול חסר" },
        { status: 400 }
      );
    }

    // Verify ownership
    const transcription = await prisma.transcription.findFirst({
      where: { 
        id,
      },
      include: {
        recording: {
          include: {
            client: true,
            session: true,
          }
        }
      }
    });

    if (!transcription) {
      return NextResponse.json(
        { message: "תמלול לא נמצא" },
        { status: 404 }
      );
    }

    // Check ownership via client or session
    const isOwner = 
      transcription.recording.client?.therapistId === userId ||
      transcription.recording.session?.therapistId === userId;

    if (!isOwner) {
      return NextResponse.json(
        { message: "אין הרשאה" },
        { status: 403 }
      );
    }

    // Update transcription content
    const updated = await prisma.transcription.update({
      where: { id },
      data: { content },
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error("Update transcription error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון התמלול" },
      { status: 500 }
    );
  }
}
