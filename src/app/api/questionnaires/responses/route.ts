import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import {
  loadScopeUser,
  buildClientWhere,
  canSecretaryAccessModel,
} from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { parseBody } from "@/lib/validations/helpers";
import { createQuestionnaireResponseSchema } from "@/lib/validations/questionnaire-response";

// POST - Create a new questionnaire response
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUserWithMode(userId);
    // תוכן קליני (שאלונים) חסום למזכירה — בדיקה קשיחה לפי scope.ts
    if (!canSecretaryAccessModel(scopeUser, "QuestionnaireResponse")) {
      return NextResponse.json(
        { message: "אין הרשאה לתוכן קליני" },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, createQuestionnaireResponseSchema);
    if ("error" in parsed) return parsed.error;
    const { templateId, clientId } = parsed.data;

    const template = await prisma.questionnaireTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json(
        { message: "שאלון לא נמצא" },
        { status: 404 }
      );
    }

    const clientWhere = buildClientWhere(scopeUser);
    const client = await prisma.client.findFirst({
      where: { AND: [{ id: clientId }, clientWhere] },
    });

    if (!client) {
      return NextResponse.json(
        { message: "מטופל לא נמצא או אין הרשאה" },
        { status: 404 }
      );
    }

    const response = await prisma.questionnaireResponse.create({
      data: {
        templateId,
        clientId,
        therapistId: client.therapistId,
        organizationId: scopeUser.organizationId,
        status: "IN_PROGRESS",
        answers: [],
      },
      include: {
        template: true,
        client: {
          select: {
            id: true,
            name: true,
            birthDate: true,
          },
        },
      },
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    logger.error("Error creating questionnaire response:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת תגובה לשאלון" },
      { status: 500 }
    );
  }
}

// GET - Get all questionnaire responses visible to this user
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUserWithMode(userId);
    // תוכן קליני חסום למזכירה — תשובות גולמיות של שאלון אסורות לצפייה
    if (!canSecretaryAccessModel(scopeUser, "QuestionnaireResponse")) {
      return NextResponse.json(
        { message: "אין הרשאה לתוכן קליני" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");

    const clientWhere = buildClientWhere(scopeUser);
    const where: Record<string, unknown> = {
      client: clientWhere,
    };

    if (clientId) {
      where.clientId = clientId;
    }

    if (status) {
      where.status = status;
    }

    const responses = await prisma.questionnaireResponse.findMany({
      where,
      include: {
        template: {
          select: {
            code: true,
            name: true,
            category: true,
            // scoring + questions נדרשים לניתוח המשולב (מנוע הפרשנות).
            scoring: true,
            questions: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(responses);
  } catch (error) {
    logger.error("Error fetching questionnaire responses:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת תגובות לשאלון" },
      { status: 500 }
    );
  }
}
