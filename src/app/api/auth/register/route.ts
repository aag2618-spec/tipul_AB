import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, phone, license, couponCode } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { message: "נא למלא את כל השדות הנדרשים" },
        { status: 400 }
      );
    }

    if (!couponCode) {
      return NextResponse.json(
        { message: "נא להזין קוד קופון" },
        { status: 400 }
      );
    }

    // Find coupon in database
    const coupon = await prisma.coupon.findUnique({
      where: { code: couponCode.trim().toUpperCase() },
    });

    // Validate coupon exists
    if (!coupon) {
      return NextResponse.json(
        { message: "קוד קופון לא תקין" },
        { status: 400 }
      );
    }

    // Check if coupon is active
    if (!coupon.isActive) {
      return NextResponse.json(
        { message: "קוד קופון זה אינו פעיל" },
        { status: 400 }
      );
    }

    // Check validity dates
    const now = new Date();
    if (coupon.validFrom > now) {
      return NextResponse.json(
        { message: "קוד קופון זה עדיין לא בתוקף" },
        { status: 400 }
      );
    }

    if (coupon.validUntil && coupon.validUntil < now) {
      return NextResponse.json(
        { message: "קוד קופון זה פג תוקף" },
        { status: 400 }
      );
    }

    // Check usage limits
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json(
        { message: "קוד קופון זה מיצה את מספר השימושים המותר" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "משתמש עם אימייל זה כבר קיים במערכת" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user and record coupon usage in a transaction
    const user = await prisma.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          phone: phone || null,
          license: license || null,
        },
      });

      // Record coupon usage
      await tx.couponUsage.create({
        data: {
          couponId: coupon.id,
          userId: newUser.id,
        },
      });

      // Update coupon usage count
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });

      // Create default notification settings
      await tx.notificationSetting.createMany({
        data: [
          {
            userId: newUser.id,
            channel: "email",
            enabled: true,
            eveningTime: "20:00",
            morningTime: "08:00",
          },
          {
            userId: newUser.id,
            channel: "push",
            enabled: true,
            eveningTime: "20:00",
            morningTime: "08:00",
          },
        ],
      });

      return newUser;
    });

    return NextResponse.json(
      { message: "המשתמש נוצר בהצלחה", userId: user.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בהרשמה" },
      { status: 500 }
    );
  }
}













