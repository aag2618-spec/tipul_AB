import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

// GET - Get business settings
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        businessType: true,
        businessName: true,
        businessPhone: true,
        businessAddress: true,
        nextReceiptNumber: true,
        receiptDefaultMode: true,
      },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    return NextResponse.json({
      name: user.name || "",
      businessType: user.businessType || "NONE",
      businessName: user.businessName || "",
      businessPhone: user.businessPhone || "",
      businessAddress: user.businessAddress || "",
      nextReceiptNumber: user.nextReceiptNumber || 1,
      receiptDefaultMode: user.receiptDefaultMode || "ASK",
    });
  } catch (error) {
    logger.error("Get business settings error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת הגדרות עסק" },
      { status: 500 }
    );
  }
}

// PUT - Update business settings
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const body = await request.json();
    const {
      businessType,
      businessName,
      businessPhone,
      businessAddress,
      nextReceiptNumber,
      receiptDefaultMode,
    } = body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        businessType: businessType || undefined,
        businessName: businessName !== undefined ? businessName : undefined,
        businessPhone: businessPhone !== undefined ? businessPhone : undefined,
        businessAddress: businessAddress !== undefined ? businessAddress : undefined,
        nextReceiptNumber: nextReceiptNumber !== undefined ? nextReceiptNumber : undefined,
        receiptDefaultMode: receiptDefaultMode || undefined,
      },
      select: {
        businessType: true,
        businessName: true,
        businessPhone: true,
        businessAddress: true,
        nextReceiptNumber: true,
        receiptDefaultMode: true,
      },
    });

    return NextResponse.json({
      message: "הגדרות נשמרו בהצלחה",
      ...updatedUser,
    });
  } catch (error) {
    logger.error("Update business settings error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בשמירת הגדרות עסק" },
      { status: 500 }
    );
  }
}
