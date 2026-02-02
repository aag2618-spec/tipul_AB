import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
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
    console.error('Error fetching AI settings:', error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

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
      where: { id: session.user.id },
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
    console.error('Error saving AI settings:', error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
