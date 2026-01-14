import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { unlink } from "fs/promises";
import { join } from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, therapistId: session.user.id },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ message: "מסמך לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(document);
  } catch (error) {
    console.error("Get document error:", error);
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.document.findFirst({
      where: { id, therapistId: session.user.id },
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
    console.error("Update document error:", error);
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: { id, therapistId: session.user.id },
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
    console.error("Delete document error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת המסמך" },
      { status: 500 }
    );
  }
}






