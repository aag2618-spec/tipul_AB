import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id: clientId } = await params;
    const body = await request.json();
    const { therapeuticApproaches, approachNotes, culturalContext } = body;

    // Verify client belongs to therapist
    const client = await prisma.client.findFirst({
      where: { id: clientId, therapistId: session.user.id },
    });

    if (!client) {
      return NextResponse.json({ message: "Client not found" }, { status: 404 });
    }

    // Update client approaches and cultural context
    const updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: {
        therapeuticApproaches: therapeuticApproaches || [],
        approachNotes: approachNotes || null,
        culturalContext: culturalContext !== undefined ? (culturalContext || null) : undefined,
      },
    });

    return NextResponse.json({
      message: "Client approaches updated successfully",
      client: updatedClient,
    });
  } catch (error) {
    console.error("Error updating client approaches:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
