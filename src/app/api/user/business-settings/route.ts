import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { parseBody } from "@/lib/validations/helpers";
import { updateBusinessSettingsSchema } from "@/lib/validations/user-settings";

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
        businessIdNumber: true,
        businessPhone: true,
        businessAddress: true,
        nextReceiptNumber: true,
        receiptDefaultMode: true,
      },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    const primaryProvider = await prisma.billingProvider.findFirst({
      where: { userId, isActive: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { provider: true },
    });

    return NextResponse.json({
      name: user.name || "",
      businessType: user.businessType || "NONE",
      businessName: user.businessName || "",
      businessIdNumber: user.businessIdNumber || "",
      businessPhone: user.businessPhone || "",
      businessAddress: user.businessAddress || "",
      nextReceiptNumber: user.nextReceiptNumber || 1,
      receiptDefaultMode: user.receiptDefaultMode || "ASK",
      externalReceiptProvider: primaryProvider?.provider ?? null,
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
    const { userId } = auth;

    const parsed = await parseBody(request, updateBusinessSettingsSchema);
    if ("error" in parsed) return parsed.error;
    const {
      businessType,
      businessName,
      businessIdNumber,
      businessPhone,
      businessAddress,
      nextReceiptNumber,
      receiptDefaultMode,
    } = parsed.data;

    // .trim() על כל השדות — מונע שמירת 200 רווחים שתעבור את ה-length check
    // ויראה תקין ב-DB אבל ריק ב-UI.
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        businessType: businessType ?? undefined,
        businessName:
          typeof businessName === "string" ? businessName.trim() : businessName,
        businessIdNumber:
          typeof businessIdNumber === "string"
            ? businessIdNumber.trim()
            : businessIdNumber,
        businessPhone:
          typeof businessPhone === "string" ? businessPhone.trim() : businessPhone,
        businessAddress:
          typeof businessAddress === "string"
            ? businessAddress.trim()
            : businessAddress,
        nextReceiptNumber: nextReceiptNumber ?? undefined,
        receiptDefaultMode: receiptDefaultMode ?? undefined,
      },
      select: {
        businessType: true,
        businessName: true,
        businessIdNumber: true,
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
