import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * One-time setup endpoint to create the first admin user
 * Only works if NO admin user exists yet (first-time setup)
 * 
 * Usage:
 *   POST /api/setup/create-admin
 *   Body: { "email": "admin@example.com", "password": "...", "name": "..." }
 */
export async function POST(request: NextRequest) {
  try {
    // Check if any admin already exists - this endpoint only works for first setup
    const existingAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
    });

    if (existingAdmin) {
      return NextResponse.json(
        { 
          message: "Admin already exists. Use /admin panel to manage users.",
          hint: "Login with existing admin credentials"
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return NextResponse.json(
        { message: "Email and password are required" },
        { status: 400 }
      );
    }

    // Check if user with this email exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Upgrade to admin
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: { role: "ADMIN" },
        select: { id: true, name: true, email: true, role: true },
      });

      return NextResponse.json({
        message: "Existing user upgraded to admin",
        user: updatedUser,
      });
    }

    // Create new admin user
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name || "מנהל המערכת",
        email,
        password: hashedPassword,
        role: "ADMIN",
      },
      select: { id: true, name: true, email: true, role: true },
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

    return NextResponse.json({
      message: "Admin user created successfully",
      user,
    }, { status: 201 });

  } catch (error) {
    console.error("Create admin error:", error);
    return NextResponse.json(
      { message: "Failed to create admin user" },
      { status: 500 }
    );
  }
}

