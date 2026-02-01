import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// POST - One-time setup to make aag2618@gmail.com an ADMIN
export async function POST(request: NextRequest) {
  try {
    // Security key to prevent unauthorized access
    const secretKey = request.headers.get("x-setup-key");
    const validSecret = process.env.SETUP_SECRET || "tipul-setup-2024";
    
    if (secretKey !== validSecret) {
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
      { error: "Failed to update user", details: String(error) },
      { status: 500 }
    );
  }
}

// GET - Check current role
export async function GET() {
  try {
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
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      user,
      is_admin: user.role === "ADMIN",
    });
  } catch (error) {
    console.error("Check admin error:", error);
    return NextResponse.json(
      { error: "Failed to check user" },
      { status: 500 }
    );
  }
}
