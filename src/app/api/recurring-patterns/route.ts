import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const patterns = await prisma.recurringPattern.findMany({
      where: { userId: session.user.id },
      include: {
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ dayOfWeek: "asc" }, { time: "asc" }],
    });

    return NextResponse.json(patterns);
  } catch (error) {
    console.error("Get recurring patterns error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת התבניות" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { dayOfWeek, time, duration, clientId } = body;

    const pattern = await prisma.recurringPattern.create({
      data: {
        userId: session.user.id,
        dayOfWeek,
        time,
        duration: duration || 50,
        clientId: clientId || null,
        isActive: true,
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(pattern, { status: 201 });
  } catch (error) {
    console.error("Create recurring pattern error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת התבנית" },
      { status: 500 }
    );
  }
}







