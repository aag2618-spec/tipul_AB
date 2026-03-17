import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    const form = await prisma.consentForm.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!form || form.therapistId !== userId) {
      return NextResponse.json({ message: "לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(form);
  } catch (error) {
    logger.error("Get consent form error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת הטופס" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;
    const body = await request.json();
    const { signatureData } = body;

    const form = await prisma.consentForm.findUnique({
      where: { id },
    });

    if (!form || form.therapistId !== userId) {
      return NextResponse.json({ message: "לא נמצא" }, { status: 404 });
    }

    const updated = await prisma.consentForm.update({
      where: { id },
      data: {
        signatureData,
        signedAt: new Date(),
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

    return NextResponse.json(updated);
  } catch (error) {
    logger.error("Sign consent form error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בחתימת הטופס" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    const form = await prisma.consentForm.findUnique({
      where: { id },
    });

    if (!form || form.therapistId !== userId) {
      return NextResponse.json({ message: "לא נמצא" }, { status: 404 });
    }

    await prisma.consentForm.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Delete consent form error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה במחיקת הטופס" },
      { status: 500 }
    );
  }
}
