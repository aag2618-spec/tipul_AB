import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// GET - קבל את כל השאלונים של המטפל
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templates = await prisma.intakeQuestionnaire.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
      },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        _count: {
          select: { responses: true },
        },
      },
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("Error fetching intake questionnaires:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

// POST - צור שאלון חדש
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, questions, isDefault } = body;

    if (isDefault) {
      await prisma.intakeQuestionnaire.updateMany({
        where: {
          userId: session.user.id,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const template = await prisma.intakeQuestionnaire.create({
      data: {
        userId: session.user.id,
        name,
        description,
        questions: questions as Prisma.InputJsonValue,
        isDefault: isDefault || false,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error("Error creating intake questionnaire:", error);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}
