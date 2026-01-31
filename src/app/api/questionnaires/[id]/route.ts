import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - קבל שאלון ספציפי
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const template = await prisma.intakeQuestionnaire.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        _count: {
          select: { responses: true },
        },
      },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error("Error fetching questionnaire template:", error);
    return NextResponse.json(
      { error: "Failed to fetch template" },
      { status: 500 }
    );
  }
}

// PUT - עדכן שאלון
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, description, questions, isDefault } = body;

    // אם זה ברירת מחדל, עדכן את כל השאלונים האחרים
    if (isDefault) {
      await prisma.intakeQuestionnaire.updateMany({
        where: {
          userId: session.user.id,
          isDefault: true,
          NOT: { id },
        },
        data: {
          isDefault: false,
        },
      });
    }

    const template = await prisma.intakeQuestionnaire.update({
      where: { id },
      data: {
        name,
        description,
        questions,
        isDefault,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error("Error updating questionnaire template:", error);
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    );
  }
}

// DELETE - מחק שאלון
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // בדוק אם יש תשובות לשאלון
    const responseCount = await prisma.intakeResponse.count({
      where: { templateId: id },
    });

    if (responseCount > 0) {
      // אם יש תשובות, סמן כלא פעיל במקום למחוק
      await prisma.intakeQuestionnaire.update({
        where: { id },
        data: { isActive: false },
      });
    } else {
      // אם אין תשובות, אפשר למחוק
      await prisma.intakeQuestionnaire.delete({
        where: { id },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting questionnaire template:", error);
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
