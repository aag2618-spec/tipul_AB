import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    // בדיקה שהפגישה שייכת למטפל
    const existingSession = await prisma.therapySession.findFirst({
      where: { id, therapistId: userId },
      include: { sessionNote: true },
    });

    if (!existingSession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    if (!existingSession.sessionNote) {
      return NextResponse.json({ message: "אין סיכום למחיקה" }, { status: 404 });
    }

    // מחיקת הסיכום בלבד (לא את הפגישה)
    await prisma.sessionNote.delete({
      where: { id: existingSession.sessionNote.id },
    });

    return NextResponse.json({ 
      message: "הסיכום נמחק בהצלחה",
      sessionId: id 
    });
  } catch (error) {
    logger.error("Delete summary error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת הסיכום" },
      { status: 500 }
    );
  }
}
