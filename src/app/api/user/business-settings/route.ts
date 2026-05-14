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

    return NextResponse.json({
      name: user.name || "",
      businessType: user.businessType || "NONE",
      businessName: user.businessName || "",
      businessIdNumber: user.businessIdNumber || "",
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

// M-validation: enum whitelists תואמים ל-Prisma (schema.prisma:692,707).
const ALLOWED_BUSINESS_TYPES = ["NONE", "EXEMPT", "LICENSED"] as const;
const ALLOWED_RECEIPT_MODES = ["ALWAYS", "ASK", "NEVER"] as const;
const MAX_BUSINESS_NAME = 200;
const MAX_BUSINESS_ID = 20;
const MAX_BUSINESS_PHONE = 30;
const MAX_BUSINESS_ADDRESS = 500;
const MAX_RECEIPT_NUMBER = 999_999_999;

// PUT - Update business settings
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    let body: Record<string, unknown>;
    try {
      const raw = await request.json();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
      }
      body = raw as Record<string, unknown>;
    } catch {
      return NextResponse.json({ message: "גוף בקשה לא תקין (JSON)" }, { status: 400 });
    }

    const {
      businessType,
      businessName,
      businessIdNumber,
      businessPhone,
      businessAddress,
      nextReceiptNumber,
      receiptDefaultMode,
    } = body;

    // businessType enum
    if (businessType !== undefined && businessType !== null) {
      if (typeof businessType !== "string" || !ALLOWED_BUSINESS_TYPES.includes(businessType as (typeof ALLOWED_BUSINESS_TYPES)[number])) {
        return NextResponse.json({ message: "סוג עסק לא תקין" }, { status: 400 });
      }
    }
    // receiptDefaultMode enum
    if (receiptDefaultMode !== undefined && receiptDefaultMode !== null) {
      if (typeof receiptDefaultMode !== "string" || !ALLOWED_RECEIPT_MODES.includes(receiptDefaultMode as (typeof ALLOWED_RECEIPT_MODES)[number])) {
        return NextResponse.json({ message: "מצב קבלה לא תקין" }, { status: 400 });
      }
    }

    // string fields with length caps
    const textChecks: Array<[string, unknown, number]> = [
      ["שם עסק", businessName, MAX_BUSINESS_NAME],
      ["מספר עוסק/ח.פ.", businessIdNumber, MAX_BUSINESS_ID],
      ["טלפון עסק", businessPhone, MAX_BUSINESS_PHONE],
      ["כתובת עסק", businessAddress, MAX_BUSINESS_ADDRESS],
    ];
    for (const [name, val, max] of textChecks) {
      if (val === undefined || val === null) continue;
      if (typeof val !== "string") {
        return NextResponse.json({ message: `${name} חייב להיות טקסט` }, { status: 400 });
      }
      if (val.length > max) {
        return NextResponse.json(
          { message: `${name} ארוך מדי (מקסימום ${max} תווים)` },
          { status: 400 }
        );
      }
    }

    // nextReceiptNumber: integer חיובי. חשוב — משפיע על מספור קבלות חוקי
    // למס הכנסה. אם NaN/שלילי/float — מסכן את החובה החוקית של רצף עוקב.
    let nextReceiptNumberSafe: number | undefined = undefined;
    if (nextReceiptNumber !== undefined && nextReceiptNumber !== null) {
      const parsed = typeof nextReceiptNumber === "number"
        ? nextReceiptNumber
        : parseInt(String(nextReceiptNumber), 10);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > MAX_RECEIPT_NUMBER) {
        return NextResponse.json(
          { message: `מספר קבלה הבא חייב להיות מספר חיובי שלם (1-${MAX_RECEIPT_NUMBER})` },
          { status: 400 }
        );
      }
      nextReceiptNumberSafe = parsed;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        businessType: typeof businessType === "string" ? (businessType as (typeof ALLOWED_BUSINESS_TYPES)[number]) : undefined,
        businessName: typeof businessName === "string" ? businessName : (businessName === null ? null : undefined),
        businessIdNumber: typeof businessIdNumber === "string" ? businessIdNumber : (businessIdNumber === null ? null : undefined),
        businessPhone: typeof businessPhone === "string" ? businessPhone : (businessPhone === null ? null : undefined),
        businessAddress: typeof businessAddress === "string" ? businessAddress : (businessAddress === null ? null : undefined),
        nextReceiptNumber: nextReceiptNumberSafe,
        receiptDefaultMode: typeof receiptDefaultMode === "string" ? (receiptDefaultMode as (typeof ALLOWED_RECEIPT_MODES)[number]) : undefined,
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
