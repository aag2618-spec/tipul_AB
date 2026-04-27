import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

// POST - One-time setup to make ADMIN_EMAIL user an ADMIN
export const dynamic = "force-dynamic";

const MIN_SETUP_SECRET_LENGTH = 32;

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(request: NextRequest) {
  try {
    // Stage 1.19 — kill-switch. Endpoint is inert unless SETUP_ENABLED=true.
    // Re-enable only during bootstrap, then unset SETUP_ENABLED.
    if (process.env.SETUP_ENABLED !== "true") {
      logger.warn("[setup/make-admin] disabled-endpoint hit", {
        ip: request.headers.get("x-forwarded-for") || "unknown",
      });
      return NextResponse.json(
        { message: "Endpoint disabled. Set SETUP_ENABLED=true to enable temporarily." },
        { status: 410 }
      );
    }

    const validSecret = process.env.SETUP_SECRET;
    if (!validSecret || validSecret.length < MIN_SETUP_SECRET_LENGTH) {
      logger.error("[setup/make-admin] SETUP_SECRET missing or too weak");
      return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
    }
    const secretKey = request.headers.get("x-setup-key") ?? "";
    if (!safeCompare(secretKey, validSecret)) {
      logger.warn("[setup/make-admin] unauthorized attempt", {
        ip: request.headers.get("x-forwarded-for") || "unknown",
      });
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Find the user
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      return NextResponse.json({ error: "משתנה סביבה ADMIN_EMAIL לא מוגדר" }, { status: 500 });
    }

    const user = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found", email: adminEmail },
        { status: 404 }
      );
    }

    // Update to ADMIN
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "User updated to ADMIN successfully",
      user: updatedUser,
      previous_role: user.role,
      new_role: updatedUser.role,
    });
  } catch (error) {
    logger.error("Setup admin error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

