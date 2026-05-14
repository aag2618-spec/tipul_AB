import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { updateBillingProviderSchema } from "@/lib/validations/integration";

// DELETE - Remove a billing provider
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // disallowImpersonation: הסרת ספק חיוב היא פעולת ניהול אישית רגישה.
    const auth = await requireAuth({ disallowImpersonation: true });
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    // בדיקה שהספק שייך למשתמש
    const provider = await prisma.billingProvider.findFirst({
      where: {
        id,
        userId: userId,
      },
    });

    if (!provider) {
      return NextResponse.json(
        { message: "Provider not found" },
        { status: 404 }
      );
    }

    // מחיקה
    await prisma.billingProvider.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "הספק נותק בהצלחה" });
  } catch (error) {
    logger.error("Error deleting billing provider:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to delete billing provider" },
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
    // disallowImpersonation: שינוי הגדרות ספק חיוב — פעולה אישית רגישה.
    const auth = await requireAuth({ disallowImpersonation: true });
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;
    const parsed = await parseBody(request, updateBillingProviderSchema);
    if ("error" in parsed) return parsed.error;
    const { isActive, isPrimary, settings } = parsed.data;

    // בדיקה שהספק שייך למשתמש
    const provider = await prisma.billingProvider.findFirst({
      where: {
        id,
        userId: userId,
      },
    });

    if (!provider) {
      return NextResponse.json(
        { message: "Provider not found" },
        { status: 404 }
      );
    }

    // עדכון
    const updated = await prisma.billingProvider.update({
      where: { id },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(isPrimary !== undefined && { isPrimary }),
        ...(settings !== undefined && { settings: settings as Prisma.InputJsonValue }),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: "ההגדרות עודכנו",
      provider: updated
    });
  } catch (error) {
    logger.error("Error updating billing provider:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Failed to update billing provider" },
      { status: 500 }
    );
  }
}
