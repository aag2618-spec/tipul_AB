import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - List all coupons
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const coupons = await prisma.coupon.findMany({
      include: {
        usages: {
          include: {
            user: {
              select: { id: true, name: true, email: true, createdAt: true },
            },
          },
          orderBy: { usedAt: "desc" },
        },
        _count: {
          select: { usages: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(coupons);
  } catch (error) {
    console.error("Get coupons error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הקופונים" },
      { status: 500 }
    );
  }
}

// POST - Create new coupon
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }

    const body = await request.json();
    const { code, name, type, maxUses, trialDays, validUntil, discount } = body;

    if (!code || !name) {
      return NextResponse.json(
        { message: "נא למלא קוד ושם לקופון" },
        { status: 400 }
      );
    }

    // Check if code already exists
    const existingCoupon = await prisma.coupon.findUnique({
      where: { code: code.trim().toUpperCase() },
    });

    if (existingCoupon) {
      return NextResponse.json(
        { message: "קוד קופון זה כבר קיים" },
        { status: 400 }
      );
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        type: type || "LIMITED",
        maxUses: type === "UNLIMITED" ? null : (maxUses || 1),
        trialDays: trialDays || 30,
        discount: discount || 0,
        validUntil: validUntil ? new Date(validUntil) : null,
      },
    });

    return NextResponse.json(coupon, { status: 201 });
  } catch (error) {
    console.error("Create coupon error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הקופון" },
      { status: 500 }
    );
  }
}
