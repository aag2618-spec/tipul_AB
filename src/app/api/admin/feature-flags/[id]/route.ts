import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

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
    logger.error("Error updating feature flag:", { error: error instanceof Error ? error.message : String(error) });
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
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

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
    logger.error("Error deleting feature flag:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
