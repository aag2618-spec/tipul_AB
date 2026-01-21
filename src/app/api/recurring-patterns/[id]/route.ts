import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

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

    const existing = await prisma.recurringPattern.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ message: "תבנית לא נמצאה" }, { status: 404 });
    }

    const pattern = await prisma.recurringPattern.update({
      where: { id },
      data: {
        dayOfWeek: body.dayOfWeek ?? existing.dayOfWeek,
        time: body.time ?? existing.time,
        duration: body.duration ?? existing.duration,
        clientId: body.clientId !== undefined ? body.clientId : existing.clientId,
        isActive: body.isActive ?? existing.isActive,
      },
    });

    return NextResponse.json(pattern);
  } catch (error) {
    console.error("Update recurring pattern error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון התבנית" },
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

    const existing = await prisma.recurringPattern.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ message: "תבנית לא נמצאה" }, { status: 404 });
    }

    await prisma.recurringPattern.delete({ where: { id } });

    return NextResponse.json({ message: "התבנית נמחקה בהצלחה" });
  } catch (error) {
    console.error("Delete recurring pattern error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת התבנית" },
      { status: 500 }
    );
  }
}







