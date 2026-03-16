import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { migrateParentReceiptsToChildren } from "@/lib/payment-service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 401 });
    }

    const result = await migrateParentReceiptsToChildren();

    return NextResponse.json({
      success: true,
      fixed: result.fixed,
      details: result.details,
      message:
        result.fixed > 0
          ? `תוקנו ${result.fixed} קבלות`
          : "אין קבלות שדורשות תיקון",
    });
  } catch (error) {
    console.error("Fix receipts error:", error);
    return NextResponse.json(
      { message: "שגיאה בתיקון הקבלות" },
      { status: 500 }
    );
  }
}
