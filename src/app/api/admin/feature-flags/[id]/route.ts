import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (adminUser?.role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { isEnabled, tiers, name, description } = body;

    const existing = await prisma.featureFlag.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { message: "Feature flag not found" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};
    if (typeof isEnabled === "boolean") data.isEnabled = isEnabled;
    if (Array.isArray(tiers)) data.tiers = tiers;
    if (typeof name === "string") data.name = name;
    if (typeof description === "string") data.description = description;

    const flag = await prisma.featureFlag.update({
      where: { id },
      data,
    });

    return NextResponse.json({ flag });
  } catch (error) {
    console.error("Error updating feature flag:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (adminUser?.role !== "ADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.featureFlag.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { message: "Feature flag not found" },
        { status: 404 }
      );
    }

    await prisma.featureFlag.delete({ where: { id } });

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    console.error("Error deleting feature flag:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
