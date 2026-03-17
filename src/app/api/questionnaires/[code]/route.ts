import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

// GET - Get questionnaire template by code
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { code } = await params;

    const template = await prisma.questionnaireTemplate.findUnique({
      where: { code },
    });

    if (!template) {
      return NextResponse.json(
        { message: "Questionnaire not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    logger.error("Error fetching questionnaire template:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to fetch questionnaire template" },
      { status: 500 }
    );
  }
}
