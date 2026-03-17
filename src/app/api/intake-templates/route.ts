import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const templates = await prisma.intakeTemplate.findMany({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(templates);
  } catch (error) {
    logger.error("Get intake templates error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת התבניות" },
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
    const { name, questions, isDefault } = body;

    if (!name || !questions) {
      return NextResponse.json(
        { message: "נא למלא את כל השדות" },
        { status: 400 }
      );
    }

    // If this is marked as default, unmark all others
    if (isDefault) {
      await prisma.intakeTemplate.updateMany({
        where: { userId: userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.intakeTemplate.create({
      data: {
        userId: userId,
        name,
        questions,
        isDefault: isDefault || false,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    logger.error("Create intake template error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת התבנית" },
      { status: 500 }
    );
  }
}







