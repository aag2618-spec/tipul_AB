import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        aiTier: true,
        therapeuticApproaches: true,
        approachDescription: true,
        analysisStyle: true,
        aiTone: true,
        customAIInstructions: true,
      }
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    logger.error('Error fetching AI settings:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const body = await request.json();
    const {
      therapeuticApproaches,
      approachDescription,
      analysisStyle,
      aiTone,
      customAIInstructions,
    } = body;

    // Validate therapeutic approaches
    if (!Array.isArray(therapeuticApproaches)) {
      return NextResponse.json(
        { message: "Invalid therapeutic approaches" },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        therapeuticApproaches,
        approachDescription: approachDescription || null,
        analysisStyle: analysisStyle || 'professional',
        aiTone: aiTone || 'formal',
        customAIInstructions: customAIInstructions || null,
      },
      select: {
        aiTier: true,
        therapeuticApproaches: true,
        approachDescription: true,
        analysisStyle: true,
        aiTone: true,
        customAIInstructions: true,
      }
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    logger.error('Error saving AI settings:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
