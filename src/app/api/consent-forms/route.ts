import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const isTemplate = searchParams.get("isTemplate") === "true";

    const where: any = { therapistId: userId };
    if (clientId) {
      where.clientId = clientId;
    }
    if (isTemplate !== undefined) {
      where.isTemplate = isTemplate;
    }

    const forms = await prisma.consentForm.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(forms);
  } catch (error) {
    logger.error("Get consent forms error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת הטפסים" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const body = await request.json();
    const { type, title, content, isTemplate, clientId } = body;

    const form = await prisma.consentForm.create({
      data: {
        type,
        title,
        content,
        isTemplate,
        clientId: clientId || null,
        therapistId: userId,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(form);
  } catch (error) {
    logger.error("Create consent form error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת הטופס" },
      { status: 500 }
    );
  }
}
