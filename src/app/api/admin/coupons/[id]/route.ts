import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - Get single coupon
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const { id } = await params;
    const coupon = await prisma.coupon.findUnique({
      where: { id },
      include: {
        usages: {
          include: {
            user: {
              select: { id: true, name: true, email: true, createdAt: true },
            },
          },
          orderBy: { usedAt: "desc" },
        },
      },
    });

    if (!coupon) {
      return NextResponse.json({ message: "קופון לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(coupon);
  } catch (error) {
    console.error("Get coupon error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הקופון" },
      { status: 500 }
    );
  }
}

// PATCH - Update coupon
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, type, maxUses, trialDays, validUntil, isActive, discount } = body;

    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(maxUses !== undefined && { maxUses }),
        ...(trialDays !== undefined && { trialDays }),
        ...(discount !== undefined && { discount }),
        ...(isActive !== undefined && { isActive }),
        ...(validUntil !== undefined && { 
          validUntil: validUntil ? new Date(validUntil) : null 
        }),
      },
    });

    return NextResponse.json(coupon);
  } catch (error) {
    console.error("Update coupon error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הקופון" },
      { status: 500 }
    );
  }
}

// DELETE - Delete coupon
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const { id } = await params;
    
    await prisma.coupon.delete({
      where: { id },
    });

    return NextResponse.json({ message: "הקופון נמחק בהצלחה" });
  } catch (error) {
    console.error("Delete coupon error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת הקופון" },
      { status: 500 }
    );
  }
}
