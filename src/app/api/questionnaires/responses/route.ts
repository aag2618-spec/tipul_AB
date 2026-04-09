import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

// POST - Create a new questionnaire response
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const body = await request.json();
    const { templateId, clientId } = body;

    if (!templateId || !clientId) {
      return NextResponse.json(
        { message: "Missing required fields: templateId, clientId" },
        { status: 400 }
      );
    }

    // Verify template exists
    const template = await prisma.questionnaireTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json(
        { message: "Questionnaire template not found" },
        { status: 404 }
      );
    }

    // Verify client exists and belongs to this therapist
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        therapistId: userId,
      },
    });

    if (!client) {
      return NextResponse.json(
        { message: "Client not found or access denied" },
        { status: 404 }
      );
    }

    // Create questionnaire response
    const response = await prisma.questionnaireResponse.create({
      data: {
        templateId,
        clientId,
        therapistId: userId,
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
      { message: "Failed to create questionnaire response" },
      { status: 500 }
    );
  }
}

// GET - Get all questionnaire responses for this therapist
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {
      therapistId: userId,
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
      { message: "Failed to fetch questionnaire responses" },
      { status: 500 }
    );
  }
}
