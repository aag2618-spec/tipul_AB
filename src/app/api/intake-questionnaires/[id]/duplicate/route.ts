import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// POST - שכפל שאלון
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const original = await prisma.intakeQuestionnaire.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!original) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const duplicate = await prisma.intakeQuestionnaire.create({
      data: {
        userId: session.user.id,
        name: `${original.name} (עותק)`,
        description: original.description,
        questions: original.questions as Prisma.InputJsonValue,
        isDefault: false,
      },
    });

    return NextResponse.json(duplicate);
  } catch (error) {
    console.error("Error duplicating intake questionnaire:", error);
    return NextResponse.json(
      { error: "Failed to duplicate template" },
      { status: 500 }
    );
  }
}
