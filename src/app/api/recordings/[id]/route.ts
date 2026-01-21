import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    const recording = await prisma.recording.findFirst({
      where: {
        id,
        OR: [
          { client: { therapistId: session.user.id } },
          { session: { therapistId: session.user.id } },
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
    console.error("Get recording error:", error);
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    const recording = await prisma.recording.findFirst({
      where: {
        id,
        OR: [
          { client: { therapistId: session.user.id } },
          { session: { therapistId: session.user.id } },
        ],
      },
    });

    if (!recording) {
      return NextResponse.json({ message: "הקלטה לא נמצאה" }, { status: 404 });
    }

    await prisma.recording.delete({ where: { id } });

    return NextResponse.json({ message: "ההקלטה נמחקה בהצלחה" });
  } catch (error) {
    console.error("Delete recording error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת ההקלטה" },
      { status: 500 }
    );
  }
}













