import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - Get all responses for a client or current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    const responses = await prisma.questionnaireResponse.findMany({
      where: {
        therapistId: session.user.id,
        ...(clientId && { clientId }),
      },
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
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(responses);
  } catch (error) {
    console.error("Error fetching questionnaire responses:", error);
    return NextResponse.json(
      { error: "Failed to fetch questionnaire responses" },
      { status: 500 }
    );
  }
}

// POST - Create a new questionnaire response
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { templateId, clientId } = await request.json();

    if (!templateId || !clientId) {
      return NextResponse.json(
        { error: "Template ID and Client ID are required" },
        { status: 400 }
      );
    }

    // Verify template exists
    const template = await prisma.questionnaireTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Questionnaire template not found" },
        { status: 404 }
      );
    }

    // Verify client belongs to therapist
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        therapistId: session.user.id,
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    // Create new response
    const response = await prisma.questionnaireResponse.create({
      data: {
        templateId,
        clientId,
        therapistId: session.user.id,
        answers: [],
        status: "IN_PROGRESS",
      },
      include: {
        template: true,
      },
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Error creating questionnaire response:", error);
    return NextResponse.json(
      { error: "Failed to create questionnaire response" },
      { status: 500 }
    );
  }
}
