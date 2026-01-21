import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - Get specific response
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const response = await prisma.questionnaireResponse.findFirst({
      where: {
        id,
        therapistId: session.user.id,
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
        { error: "Response not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching questionnaire response:", error);
    return NextResponse.json(
      { error: "Failed to fetch questionnaire response" },
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { answers, status, totalScore, subscores } = body;

    // Verify ownership
    const existing = await prisma.questionnaireResponse.findFirst({
      where: {
        id,
        therapistId: session.user.id,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Response not found" },
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
    console.error("Error updating questionnaire response:", error);
    return NextResponse.json(
      { error: "Failed to update questionnaire response" },
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const existing = await prisma.questionnaireResponse.findFirst({
      where: {
        id,
        therapistId: session.user.id,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Response not found" },
        { status: 404 }
      );
    }

    await prisma.questionnaireResponse.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting questionnaire response:", error);
    return NextResponse.json(
      { error: "Failed to delete questionnaire response" },
      { status: 500 }
    );
  }
}
