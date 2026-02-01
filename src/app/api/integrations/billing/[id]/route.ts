import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// DELETE - Remove a billing provider
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // בדיקה שהספק שייך למשתמש
    const provider = await prisma.billingProvider.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!provider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    // מחיקה
    await prisma.billingProvider.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "הספק נותק בהצלחה" });
  } catch (error) {
    console.error("Error deleting billing provider:", error);
    return NextResponse.json(
      { error: "Failed to delete billing provider" },
      { status: 500 }
    );
  }
}

// PATCH - Update provider settings
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { isActive, isPrimary, settings } = body;

    // בדיקה שהספק שייך למשתמש
    const provider = await prisma.billingProvider.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!provider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    // עדכון
    const updated = await prisma.billingProvider.update({
      where: { id },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(isPrimary !== undefined && { isPrimary }),
        ...(settings !== undefined && { settings }),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: "ההגדרות עודכנו",
      provider: updated
    });
  } catch (error) {
    console.error("Error updating billing provider:", error);
    return NextResponse.json(
      { error: "Failed to update billing provider" },
      { status: 500 }
    );
  }
}
