import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// POST - One-time setup to make aag2618@gmail.com an ADMIN
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const secretKey = request.headers.get("x-setup-key");
    const validSecret = process.env.SETUP_SECRET;
    
    if (!validSecret || secretKey !== validSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: "aag2618@gmail.com" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found", email: "aag2618@gmail.com" },
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
    console.error("Setup admin error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

