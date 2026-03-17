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

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        license: true,
        image: true,
        defaultSessionDuration: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    logger.error("Get profile error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הפרופיל" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const body = await request.json();
    const { name, phone, license, defaultSessionDuration } = body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name || undefined,
        phone: phone || null,
        license: license || null,
        defaultSessionDuration: defaultSessionDuration ? parseInt(defaultSessionDuration) : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        license: true,
        defaultSessionDuration: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    logger.error("Update profile error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הפרופיל" },
      { status: 500 }
    );
  }
}













