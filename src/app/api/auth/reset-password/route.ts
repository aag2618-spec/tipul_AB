import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json(
        { error: "נא למלא את כל השדות" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "הסיסמה חייבת להכיל לפחות 6 תווים" },
        { status: 400 }
      );
    }

    // Find the reset token
    const resetRecord = await prisma.passwordReset.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetRecord) {
      return NextResponse.json(
        { error: "קישור לא תקין או שפג תוקפו" },
        { status: 400 }
      );
    }

    // Check if token is expired
    if (new Date() > resetRecord.expiresAt) {
      await prisma.passwordReset.delete({ where: { id: resetRecord.id } });
      return NextResponse.json(
        { error: "הקישור פג תוקף. נא לבקש קישור חדש" },
        { status: 400 }
      );
    }

    // Check if already used
    if (resetRecord.usedAt) {
      return NextResponse.json(
        { error: "קישור זה כבר נוצל. נא לבקש קישור חדש" },
        { status: 400 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update password and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { password: hashedPassword },
      }),
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({
      message: "הסיסמה עודכנה בהצלחה! ניתן להתחבר עכשיו",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "שגיאה באיפוס הסיסמה" },
      { status: 500 }
    );
  }
}

// GET - Validate token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ valid: false, error: "חסר טוקן" });
    }

    const resetRecord = await prisma.passwordReset.findUnique({
      where: { token },
    });

    if (!resetRecord) {
      return NextResponse.json({ valid: false, error: "קישור לא תקין" });
    }

    if (new Date() > resetRecord.expiresAt) {
      return NextResponse.json({ valid: false, error: "הקישור פג תוקף" });
    }

    if (resetRecord.usedAt) {
      return NextResponse.json({ valid: false, error: "קישור זה כבר נוצל" });
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("Validate token error:", error);
    return NextResponse.json({ valid: false, error: "שגיאה" });
  }
}
