import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST - Create a new questionnaire response
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { templateId, clientId } = body;

    if (!templateId || !clientId) {
      return NextResponse.json(
        { error: "Missing required fields: templateId, clientId" },
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

    // Verify client exists and belongs to this therapist
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        therapistId: session.user.id,
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found or access denied" },
        { status: 404 }
      );
    }

    // Create questionnaire response
    const response = await prisma.questionnaireResponse.create({
      data: {
        templateId,
        clientId,
        therapistId: session.user.id,
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
    console.error("Error creating questionnaire response:", error);
    return NextResponse.json(
      { error: "Failed to create questionnaire response" },
      { status: 500 }
    );
  }
}

// GET - Get all questionnaire responses for this therapist
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const status = searchParams.get("status");

    const where: any = {
      therapistId: session.user.id,
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
    console.error("Error fetching questionnaire responses:", error);
    return NextResponse.json(
      { error: "Failed to fetch questionnaire responses" },
      { status: 500 }
    );
  }
}
