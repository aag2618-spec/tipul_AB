import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

// GET - קבל תשובה ספציפית
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

    const response = await prisma.intakeResponse.findFirst({
      where: { 
        id,
        client: {
          therapistId: userId,
        },
      },
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

    if (!response) {
      return NextResponse.json({ message: "Response not found" }, { status: 404 });
    }

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error fetching intake response:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to fetch response" },
      { status: 500 }
    );
  }
}
