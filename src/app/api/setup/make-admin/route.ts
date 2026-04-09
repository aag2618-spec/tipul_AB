import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

// POST - One-time setup to make ADMIN_EMAIL user an ADMIN
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const secretKey = request.headers.get("x-setup-key");
    const validSecret = process.env.SETUP_SECRET;
    
    if (!validSecret || secretKey !== validSecret) {
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

