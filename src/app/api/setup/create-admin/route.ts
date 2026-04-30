import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logger } from "@/lib/logger";

/**
 * One-time setup endpoint to create the first admin user
 * Only works if NO admin user exists yet (first-time setup)
 * 
 * Usage:
 *   POST /api/setup/create-admin
 *   Body: { "email": "admin@example.com", "password": "...", "name": "..." }
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Stage 1.19 — kill-switch. Endpoint is inert unless SETUP_ENABLED=true.
    // Reason: race-condition risk where attacker reaches this URL before the
    // legitimate first-time admin is provisioned. Re-enable only during initial
    // bootstrap, then unset SETUP_ENABLED.
    if (process.env.SETUP_ENABLED !== "true") {
      logger.warn("[setup/create-admin] disabled-endpoint hit", {
        ip: request.headers.get("x-forwarded-for") || "unknown",
      });
      return NextResponse.json(
        { message: "Endpoint disabled. Set SETUP_ENABLED=true to enable temporarily." },
        { status: 410 }
      );
    }

    // C3 — defense-in-depth: גם אם SETUP_ENABLED נשאר true בטעות, נדרש סוד
    // משותף ב-header x-setup-key. השוואה constant-time עם timingSafeEqual
    // מונעת timing attacks.
    const setupSecret = process.env.SETUP_SECRET;
    if (!setupSecret || setupSecret.length < 32) {
      logger.error("[setup/create-admin] SETUP_SECRET not configured (>=32 chars required)");
      return NextResponse.json(
        { message: "Setup secret not configured" },
        { status: 500 }
      );
    }

    const providedKey = request.headers.get("x-setup-key") || "";
    const providedBuf = Buffer.from(providedKey);
    const expectedBuf = Buffer.from(setupSecret);
    const keyValid =
      providedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(providedBuf, expectedBuf);
    if (!keyValid) {
      logger.warn("[setup/create-admin] invalid setup key", {
        ip: request.headers.get("x-forwarded-for") || "unknown",
      });
      return NextResponse.json(
        { message: "Invalid setup key" },
        { status: 403 }
      );
    }

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
    logger.error("Create admin error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to create admin user" },
      { status: 500 }
    );
  }
}

