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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        license: true,
        image: true,
        defaultSessionDuration: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Get profile error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הפרופיל" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { name, phone, license, defaultSessionDuration } = body;

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: name || undefined,
        phone: phone || null,
        license: license || null,
        defaultSessionDuration: defaultSessionDuration ? parseInt(defaultSessionDuration) : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        license: true,
        defaultSessionDuration: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הפרופיל" },
      { status: 500 }
    );
  }
}













