import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;
    const body = await request.json();
    const { content, isPrivate, aiAnalysis } = body;

    // Verify session belongs to therapist
    const therapySession = await prisma.therapySession.findFirst({
      where: { id, therapistId: userId },
    });

    if (!therapySession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    // Check if note already exists - if so, update it instead of creating
    const existingNote = await prisma.sessionNote.findUnique({
      where: { sessionId: id },
    });

    if (existingNote) {
      // Update existing note
      const note = await prisma.sessionNote.update({
        where: { sessionId: id },
        data: {
          content,
          isPrivate: isPrivate || false,
          aiAnalysis: aiAnalysis || null,
        },
      });
      return NextResponse.json(note);
    }

    const note = await prisma.sessionNote.create({
      data: {
        sessionId: id,
        content,
        isPrivate: isPrivate || false,
        aiAnalysis: aiAnalysis || null,
      },
    });

    // WRITE_SUMMARY tasks no longer used - sessionNote IS NULL is the source of truth

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    logger.error("Create note error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הסיכום" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;
    const body = await request.json();
    const { content, isPrivate, aiAnalysis } = body;

    // Verify session belongs to therapist
    const therapySession = await prisma.therapySession.findFirst({
      where: { id, therapistId: userId },
      include: { sessionNote: true },
    });

    if (!therapySession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    if (!therapySession.sessionNote) {
      return NextResponse.json(
        { message: "סיכום לא נמצא" },
        { status: 404 }
      );
    }

    const note = await prisma.sessionNote.update({
      where: { sessionId: id },
      data: {
        content: content !== undefined ? content : undefined,
        isPrivate: isPrivate !== undefined ? isPrivate : undefined,
        aiAnalysis: aiAnalysis !== undefined ? aiAnalysis : undefined,
      },
    });

    return NextResponse.json(note);
  } catch (error) {
    logger.error("Update note error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הסיכום" },
      { status: 500 }
    );
  }
}













