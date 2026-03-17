import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

// POST - שכפל שאלון
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    const original = await prisma.intakeQuestionnaire.findFirst({
      where: {
        id,
        userId: userId,
      },
    });

    if (!original) {
      return NextResponse.json({ message: "Template not found" }, { status: 404 });
    }

    const duplicate = await prisma.intakeQuestionnaire.create({
      data: {
        userId: userId,
        name: `${original.name} (עותק)`,
        description: original.description,
        questions: original.questions as Prisma.InputJsonValue,
        isDefault: false,
      },
    });

    return NextResponse.json(duplicate);
  } catch (error) {
    logger.error("Error duplicating intake questionnaire:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to duplicate template" },
      { status: 500 }
    );
  }
}
