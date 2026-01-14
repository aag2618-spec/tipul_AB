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

    const templates = await prisma.intakeTemplate.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("Get intake templates error:", error);
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
    const { name, questions, isDefault } = body;

    if (!name || !questions) {
      return NextResponse.json(
        { message: "נא למלא את כל השדות" },
        { status: 400 }
      );
    }

    // If this is marked as default, unmark all others
    if (isDefault) {
      await prisma.intakeTemplate.updateMany({
        where: { userId: session.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.intakeTemplate.create({
      data: {
        userId: session.user.id,
        name,
        questions,
        isDefault: isDefault || false,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("Create intake template error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת התבנית" },
      { status: 500 }
    );
  }
}







