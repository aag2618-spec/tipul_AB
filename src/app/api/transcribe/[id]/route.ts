import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

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
      transcription.recording.client?.therapistId === session.user.id ||
      transcription.recording.session?.therapistId === session.user.id;

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
    console.error("Update transcription error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון התמלול" },
      { status: 500 }
    );
  }
}
