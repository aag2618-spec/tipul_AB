import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { serializePrisma } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id: clientId } = await params;
    const body = await request.json();
    const { therapeuticApproaches, approachNotes, culturalContext } = body;

    // Verify client belongs to therapist
    const client = await prisma.client.findFirst({
      where: { id: clientId, therapistId: userId },
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
      client: serializePrisma(updatedClient),
    });
  } catch (error) {
    logger.error("Error updating client approaches:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
