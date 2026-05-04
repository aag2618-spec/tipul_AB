import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { buildSessionWhere, isSecretary, loadScopeUser } from "@/lib/scope";
import { sanitizeUserHtml } from "@/lib/sanitize-html";

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

    const scopeUser = await loadScopeUser(userId);

    // SessionNote is clinical content — secretaries are blocked.
    if (isSecretary(scopeUser)) {
      return NextResponse.json(
        { message: "אין הרשאה לתוכן קליני" },
        { status: 403 }
      );
    }

    const sessionScopeWhere = buildSessionWhere(scopeUser);

    // Verify session belongs to therapist / clinic scope
    const therapySession = await prisma.therapySession.findFirst({
      where: { AND: [{ id }, sessionScopeWhere] },
    });

    if (!therapySession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    // Check if note already exists - if so, update it instead of creating
    const existingNote = await prisma.sessionNote.findUnique({
      where: { sessionId: id },
    });

    // H4: sanitize HTML מ-TipTap לפני שמירה ל-DB.
    // aiAnalysis הוא תוצר LLM (text רגיל) ולא נכתב ע"י משתמש — לא דורש sanitize.
    const safeContent = sanitizeUserHtml(content);

    if (existingNote) {
      // Update existing note
      const note = await prisma.sessionNote.update({
        where: { sessionId: id },
        data: {
          content: safeContent,
          isPrivate: isPrivate || false,
          aiAnalysis: aiAnalysis || null,
        },
      });
      return NextResponse.json(note);
    }

    const note = await prisma.sessionNote.create({
      data: {
        sessionId: id,
        content: safeContent,
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

    const scopeUser = await loadScopeUser(userId);

    if (isSecretary(scopeUser)) {
      return NextResponse.json(
        { message: "אין הרשאה לתוכן קליני" },
        { status: 403 }
      );
    }

    const sessionScopeWhere = buildSessionWhere(scopeUser);

    // Verify session belongs to therapist / clinic scope
    const therapySession = await prisma.therapySession.findFirst({
      where: { AND: [{ id }, sessionScopeWhere] },
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

    // H4: sanitize HTML רק אם content הוגש (PUT הוא partial update).
    const note = await prisma.sessionNote.update({
      where: { sessionId: id },
      data: {
        content: content !== undefined ? sanitizeUserHtml(content) : undefined,
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













