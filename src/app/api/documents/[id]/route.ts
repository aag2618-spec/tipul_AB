import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { unlink } from "fs/promises";
import { join } from "path";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { logDataAccess } from "@/lib/audit-logger";

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

    // Atomic update with ownership check ב-WHERE — מונע race condition
    const updateResult = await prisma.document.updateMany({
      where: { id, therapistId: userId },
      data: {
        name: body.name ?? existing.name,
        type: body.type ?? existing.type,
        signed: body.signed ?? existing.signed,
        signedAt: body.signed && !existing.signed ? new Date() : existing.signedAt,
      },
    });

    if (updateResult.count === 0) {
      return NextResponse.json({ message: "מסמך לא נמצא" }, { status: 404 });
    }

    const document = await prisma.document.findUnique({ where: { id } });
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

    // Atomic delete — ownership ב-WHERE מונע race condition
    const deleteResult = await prisma.document.deleteMany({
      where: { id, therapistId: userId },
    });

    if (deleteResult.count === 0) {
      return NextResponse.json({ message: "מסמך לא נמצא" }, { status: 404 });
    }

    // Delete file (after DB delete succeeded)
    try {
      const filePath = join(process.cwd(), document.fileUrl);
      await unlink(filePath);
    } catch {
      // File might not exist, continue anyway
    }

    // Audit log — פעולה הרסנית על מסמך רפואי
    logDataAccess({
      userId,
      recordType: "DOCUMENT",
      recordId: id,
      action: "DELETE",
      clientId: document.clientId,
      request,
    });

    return NextResponse.json({ message: "המסמך נמחק בהצלחה" });
  } catch (error) {
    logger.error("Delete document error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת המסמך" },
      { status: 500 }
    );
  }
}






