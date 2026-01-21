import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

// POST - Reset password for a user (requires secret key)
export async function POST(request: NextRequest) {
  try {
    const secretKey = request.headers.get("x-admin-key");
    const validSecret = process.env.ADMIN_SECRET || "tipul-admin-2024";
    
    if (secretKey !== validSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, newPassword } = await request.json();

    if (!email || !newPassword) {
      return NextResponse.json(
        { error: "נדרש אימייל וסיסמה חדשה" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "הסיסמה חייבת להכיל לפחות 6 תווים" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
      // List available users for debugging
      const users = await prisma.user.findMany({
        select: { email: true, name: true, role: true },
        take: 10,
      });
      
      return NextResponse.json(
        { 
          error: "משתמש לא נמצא",
          availableUsers: users 
        },
        { status: 404 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return NextResponse.json({
      message: "הסיסמה אופסה בהצלחה",
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "שגיאה באיפוס הסיסמה" },
      { status: 500 }
    );
  }
}
