import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - Get business settings
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
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
      businessType: user.businessType || "NONE",
      businessName: user.businessName || "",
      businessPhone: user.businessPhone || "",
      businessAddress: user.businessAddress || "",
      nextReceiptNumber: user.nextReceiptNumber || 1,
      receiptDefaultMode: user.receiptDefaultMode || "ASK",
    });
  } catch (error) {
    console.error("Get business settings error:", error);
    return NextResponse.json(
      { message: "שגיאה בטעינת הגדרות עסק" },
      { status: 500 }
    );
  }
}

// PUT - Update business settings
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

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
      where: { id: session.user.id },
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
    console.error("Update business settings error:", error);
    return NextResponse.json(
      { message: "שגיאה בשמירת הגדרות עסק" },
      { status: 500 }
    );
  }
}
