import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { unlink } from "fs/promises";
import { join } from "path";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

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

    const document = await prisma.document.findFirst({
      where: { id, therapistId: userId },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ message: "מסמך לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(document);
  } catch (error) {
    logger.error("Get document error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המסמך" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.document.findFirst({
      where: { id, therapistId: userId },
    });

    if (!existing) {
      return NextResponse.json({ message: "מסמך לא נמצא" }, { status: 404 });
    }

    const document = await prisma.document.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        type: body.type ?? existing.type,
        signed: body.signed ?? existing.signed,
        signedAt: body.signed && !existing.signed ? new Date() : existing.signedAt,
      },
    });

    return NextResponse.json(document);
  } catch (error) {
    logger.error("Update document error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון המסמך" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, therapistId: userId },
    });

    if (!document) {
      return NextResponse.json({ message: "מסמך לא נמצא" }, { status: 404 });
    }

    // Delete file
    try {
      const filePath = join(process.cwd(), document.fileUrl);
      await unlink(filePath);
    } catch {
      // File might not exist, continue anyway
    }

    await prisma.document.delete({ where: { id } });

    return NextResponse.json({ message: "המסמך נמחק בהצלחה" });
  } catch (error) {
    logger.error("Delete document error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת המסמך" },
      { status: 500 }
    );
  }
}






