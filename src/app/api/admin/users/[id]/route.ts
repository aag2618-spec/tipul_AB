import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if admin
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (adminUser?.role !== 'ADMIN') {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, email, password, phone, role, aiTier } = body;

    // Build update data
    const updateData: any = {
      name,
      email,
      phone,
      role,
    };

    // Add aiTier if provided
    if (aiTier !== undefined) {
      updateData.aiTier = aiTier;
    }

    // Only update password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      message: "User updated successfully",
      user: { ...updatedUser, password: undefined }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if admin
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (adminUser?.role !== 'ADMIN') {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Prevent deleting self
    if (id === session.user.id) {
      return NextResponse.json(
        { message: "אי אפשר למחוק את עצמך" },
        { status: 400 }
      );
    }

    // Delete user
    await prisma.user.delete({
      where: { id }
    });

    return NextResponse.json({
      message: "User deleted successfully"
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if admin
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (adminUser?.role !== 'ADMIN') {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { isBlocked, aiTier } = body;

    const updateData: any = {};
    if (isBlocked !== undefined) updateData.isBlocked = isBlocked;
    if (aiTier !== undefined) updateData.aiTier = aiTier;

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      message: "עודכן בהצלחה",
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user block status:', error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
