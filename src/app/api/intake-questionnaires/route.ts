import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { parseBody } from "@/lib/validations/helpers";
import { createQuestionnaireSchema } from "@/lib/validations/intake-questionnaire";

// GET - קבל את כל השאלונים של המטפל
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    // בקליניקה: כל שאלוני הארגון (כדי שמטפל/מזכירה יוכלו לבחור לשליחה).
    // מטפל עצמאי (organizationId=null): רק שלו — התנהגות קיימת.
    const scopeUser = await loadScopeUserWithMode(userId);
    const where: Prisma.IntakeQuestionnaireWhereInput = scopeUser.organizationId
      ? { isActive: true, user: { organizationId: scopeUser.organizationId } }
      : { userId, isActive: true };

    const templates = await prisma.intakeQuestionnaire.findMany({
      where,
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

    const parsed = await parseBody(req, createQuestionnaireSchema);
    if ("error" in parsed) return parsed.error;
    const { name, description, questions, isDefault } = parsed.data;

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
        name,
        description: description ?? null,
        questions: (questions ?? []) as Prisma.InputJsonValue,
        isDefault: isDefault ?? false,
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
