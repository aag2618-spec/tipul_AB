import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

// POST - שמור תשובות
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const body = await req.json();
    const { clientId, templateId, responses } = body;

    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        therapistId: userId,
      },
    });

    if (!client) {
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

    if (templateId) {
      const template = await prisma.intakeQuestionnaire.findFirst({
        where: { id: templateId, userId: userId },
      });
      if (!template) {
        return NextResponse.json({ message: "Template not found" }, { status: 404 });
      }
    }

    const response = await prisma.intakeResponse.create({
      data: {
        clientId,
        templateId,
        responses: responses as Prisma.InputJsonValue,
      },
      include: {
        template: true,
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error saving intake response:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to save response" },
      { status: 500 }
    );
  }
}

// GET - קבל תשובות של לקוח
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json({ message: "Client ID required" }, { status: 400 });
    }

    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        therapistId: userId,
      },
    });

    if (!client) {
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

    const responses = await prisma.intakeResponse.findMany({
      where: { clientId },
      include: {
        template: true,
      },
      orderBy: {
        filledAt: "desc",
      },
    });

    return NextResponse.json(responses);
  } catch (error) {
    logger.error("Error fetching intake responses:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to fetch responses" },
      { status: 500 }
    );
  }
}
