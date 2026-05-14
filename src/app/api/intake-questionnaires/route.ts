import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { validateQuestionnaireInput } from "@/lib/validation/intake-questionnaire";

// GET - קבל את כל השאלונים של המטפל
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const templates = await prisma.intakeQuestionnaire.findMany({
      where: {
        userId: userId,
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
    logger.error("Error fetching intake questionnaires:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

// POST - צור שאלון חדש
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    let body: Record<string, unknown>;
    try {
      const raw = await req.json();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
      }
      body = raw as Record<string, unknown>;
    } catch {
      return NextResponse.json({ message: "גוף בקשה לא תקין (JSON)" }, { status: 400 });
    }

    const err = validateQuestionnaireInput({ body, requireName: true });
    if (err) return err;

    const { name, description, questions, isDefault } = body;

    if (isDefault) {
      await prisma.intakeQuestionnaire.updateMany({
        where: {
          userId: userId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const template = await prisma.intakeQuestionnaire.create({
      data: {
        userId: userId,
        name: (name as string).trim(),
        description: (description as string | undefined) ?? null,
        questions: (questions ?? []) as Prisma.InputJsonValue,
        isDefault: typeof isDefault === "boolean" ? isDefault : false,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    logger.error("Error creating intake questionnaire:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to create template" },
      { status: 500 }
    );
  }
}
