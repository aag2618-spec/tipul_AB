import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { updateQuestionnaireSchema } from "@/lib/validations/intake-questionnaire";

// GET - קבל שאלון ספציפי
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    const template = await prisma.intakeQuestionnaire.findFirst({
      where: {
        id,
        userId: userId,
      },
      include: {
        _count: {
          select: { responses: true },
        },
      },
    });

    if (!template) {
      return NextResponse.json({ message: "Template not found" }, { status: 404 });
    }

    return NextResponse.json(template);
  } catch (error) {
    logger.error("Error fetching intake questionnaire:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to fetch template" },
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
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    // H12: validation עם partial schema (PUT — אם name נשלח חייב תקין, אחרת נשמור).
    const parsed = await parseBody(req, updateQuestionnaireSchema);
    if ("error" in parsed) return parsed.error;
    const { name, description, questions, isDefault } = parsed.data;

    if (isDefault) {
      await prisma.intakeQuestionnaire.updateMany({
        where: {
          userId: userId,
          isDefault: true,
          NOT: { id },
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Atomic update — ownership (userId) ב-WHERE מונע IDOR.
    // שדות שלא נשלחו → undefined → Prisma לא יעדכן (partial update).
    const updateResult = await prisma.intakeQuestionnaire.updateMany({
      where: { id, userId },
      data: {
        name: name ?? undefined,
        description: description === undefined ? undefined : description,
        questions:
          questions !== undefined ? (questions as Prisma.InputJsonValue) : undefined,
        isDefault: isDefault ?? undefined,
      },
    });

    if (updateResult.count === 0) {
      return NextResponse.json(
        { message: "Template not found" },
        { status: 404 }
      );
    }

    const template = await prisma.intakeQuestionnaire.findUnique({
      where: { id },
    });
    return NextResponse.json(template);
  } catch (error) {
    logger.error("Error updating intake questionnaire:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to update template" },
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
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    // אימות בעלות לפני כל פעולה — ownership ב-WHERE מונע IDOR
    const ownsTemplate = await prisma.intakeQuestionnaire.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!ownsTemplate) {
      return NextResponse.json(
        { message: "Template not found" },
        { status: 404 }
      );
    }

    const responseCount = await prisma.intakeResponse.count({
      where: { templateId: id },
    });

    if (responseCount > 0) {
      // Soft delete — מצומצם רק לטמפלטים של המשתמש הנוכחי
      const updateResult = await prisma.intakeQuestionnaire.updateMany({
        where: { id, userId },
        data: { isActive: false },
      });
      if (updateResult.count === 0) {
        return NextResponse.json(
          { message: "Template not found" },
          { status: 404 }
        );
      }
    } else {
      const deleteResult = await prisma.intakeQuestionnaire.deleteMany({
        where: { id, userId },
      });
      if (deleteResult.count === 0) {
        return NextResponse.json(
          { message: "Template not found" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error deleting intake questionnaire:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to delete template" },
      { status: 500 }
    );
  }
}
