import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

// Valid coupon codes for registration
const VALID_COUPONS = (process.env.VALID_COUPONS || "TIPUL2024,BETA2024").split(",").map(c => c.trim().toUpperCase());

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

    // Validate coupon code
    if (!couponCode || !VALID_COUPONS.includes(couponCode.trim().toUpperCase())) {
      return NextResponse.json(
        { message: "קוד קופון לא תקין" },
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

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone: phone || null,
        license: license || null,
      },
    });

    // Create default notification settings
    await prisma.notificationSetting.createMany({
      data: [
        {
          userId: user.id,
          channel: "email",
          enabled: true,
          eveningTime: "20:00",
          morningTime: "08:00",
        },
        {
          userId: user.id,
          channel: "push",
          enabled: true,
          eveningTime: "20:00",
          morningTime: "08:00",
        },
      ],
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













