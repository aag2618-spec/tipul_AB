import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { content, isPrivate, aiAnalysis } = body;

    // Verify session belongs to therapist
    const therapySession = await prisma.therapySession.findFirst({
      where: { id, therapistId: session.user.id },
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

    // Update related task if exists
    await prisma.task.updateMany({
      where: {
        userId: session.user.id,
        relatedEntityId: id,
        type: "WRITE_SUMMARY",
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: {
        status: "COMPLETED",
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("Create note error:", error);
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { content, isPrivate, aiAnalysis } = body;

    // Verify session belongs to therapist
    const therapySession = await prisma.therapySession.findFirst({
      where: { id, therapistId: session.user.id },
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
    console.error("Update note error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הסיכום" },
      { status: 500 }
    );
  }
}













