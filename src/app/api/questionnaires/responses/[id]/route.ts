import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

// GET - Get specific response
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

    const response = await prisma.questionnaireResponse.findFirst({
      where: {
        id,
        therapistId: userId,
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

    if (!response) {
      return NextResponse.json(
        { message: "Response not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error fetching questionnaire response:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to fetch questionnaire response" },
      { status: 500 }
    );
  }
}

// PATCH - Update response (save answers, complete, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;
    const body = await request.json();
    const { answers, status, totalScore, subscores } = body;

    // Verify ownership
    const existing = await prisma.questionnaireResponse.findFirst({
      where: {
        id,
        therapistId: userId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "Response not found" },
        { status: 404 }
      );
    }

    const updateData: any = {};
    
    if (answers !== undefined) {
      updateData.answers = answers;
    }
    
    if (totalScore !== undefined) {
      updateData.totalScore = totalScore;
    }
    
    if (subscores !== undefined) {
      updateData.subscores = subscores;
    }
    
    if (status === "COMPLETED") {
      updateData.status = "COMPLETED";
      updateData.completedAt = new Date();
    } else if (status) {
      updateData.status = status;
    }

    const response = await prisma.questionnaireResponse.update({
      where: { id },
      data: updateData,
      include: {
        template: true,
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error updating questionnaire response:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to update questionnaire response" },
      { status: 500 }
    );
  }
}

// DELETE - Delete response
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    // Verify ownership
    const existing = await prisma.questionnaireResponse.findFirst({
      where: {
        id,
        therapistId: userId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "Response not found" },
        { status: 404 }
      );
    }

    await prisma.questionnaireResponse.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error deleting questionnaire response:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to delete questionnaire response" },
      { status: 500 }
    );
  }
}
