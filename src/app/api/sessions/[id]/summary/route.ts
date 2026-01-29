import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

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

    // בדיקה שהפגישה שייכת למטפל
    const existingSession = await prisma.therapySession.findFirst({
      where: { id, therapistId: session.user.id },
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
    console.error("Delete summary error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת הסיכום" },
      { status: 500 }
    );
  }
}
