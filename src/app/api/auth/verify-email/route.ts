import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      // Redirect to login with error
      return NextResponse.redirect(
        new URL("/login?error=missing-token", request.nextUrl.origin)
      );
    }

    // Find user by verification token
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: { gte: new Date() },
      },
    });

    if (!user) {
      // Token invalid or expired
      return NextResponse.redirect(
        new URL("/login?error=invalid-token", request.nextUrl.origin)
      );
    }

    // Verify the email
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    // Redirect to login with success message
    return NextResponse.redirect(
      new URL("/login?verified=true", request.nextUrl.origin)
    );
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.redirect(
      new URL("/login?error=verification-failed", request.nextUrl.origin)
    );
  }
}
