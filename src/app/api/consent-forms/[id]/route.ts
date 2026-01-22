import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

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

    if (!form || form.therapistId !== session.user.id) {
      return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(form);
  } catch (error) {
    console.error("Get consent form error:", error);
    return NextResponse.json(
      { error: "שגיאה בטעינת הטופס" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { signatureData } = body;

    const form = await prisma.consentForm.findUnique({
      where: { id },
    });

    if (!form || form.therapistId !== session.user.id) {
      return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
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
    console.error("Sign consent form error:", error);
    return NextResponse.json(
      { error: "שגיאה בחתימת הטופס" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    const form = await prisma.consentForm.findUnique({
      where: { id },
    });

    if (!form || form.therapistId !== session.user.id) {
      return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    }

    await prisma.consentForm.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete consent form error:", error);
    return NextResponse.json(
      { error: "שגיאה במחיקת הטופס" },
      { status: 500 }
    );
  }
}
