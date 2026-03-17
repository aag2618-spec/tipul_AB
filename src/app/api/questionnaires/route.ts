import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

// GET - Get all questionnaire templates
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const templates = await prisma.questionnaireTemplate.findMany({
      orderBy: [
        { category: "asc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(templates);
  } catch (error) {
    logger.error("Error fetching questionnaire templates:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to fetch questionnaire templates" },
      { status: 500 }
    );
  }
}
