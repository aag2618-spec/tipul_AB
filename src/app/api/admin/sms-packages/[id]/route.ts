import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// PATCH — עדכון חבילת SMS קיימת.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("packages.catalog_manage");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.package.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ message: "חבילה לא נמצאה" }, { status: 404 });
    }
    if (existing.type !== "SMS") {
      return NextResponse.json(
        { message: "חבילה זו אינה חבילת SMS — לא ניתן לערוך מכאן" },
        { status: 400 }
      );
    }

    if (body.credits !== undefined) {
      if (typeof body.credits !== "number" || body.credits <= 0 || !Number.isInteger(body.credits)) {
        return NextResponse.json(
          { message: "כמות יחידות חייבת להיות מספר שלם חיובי" },
          { status: 400 }
        );
      }
    }
    if (body.priceIls !== undefined) {
      if (typeof body.priceIls !== "number" || body.priceIls < 0) {
        return NextResponse.json(
          { message: "מחיר חייב להיות מספר אי-שלילי" },
          { status: 400 }
        );
      }
    }

    const pkg = await withAudit(
      { kind: "user", session },
      {
        action: "update_sms_package",
        targetType: "Package",
        targetId: id,
        details: { changes: Object.keys(body) },
      },
      async (tx) => {
        return tx.package.update({
          where: { id },
          data: {
            ...(body.name !== undefined && { name: String(body.name).trim() }),
            ...(body.credits !== undefined && { credits: body.credits }),
            ...(body.priceIls !== undefined && { priceIls: body.priceIls }),
            ...(body.isActive !== undefined && { isActive: Boolean(body.isActive) }),
          },
        });
      }
    );

    return NextResponse.json(JSON.parse(JSON.stringify(pkg)));
  } catch (error) {
    logger.error("[admin/sms-packages/[id]] PATCH error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון החבילה" },
      { status: 500 }
    );
  }
}

// DELETE — חוסם מחיקה אם יש רכישות; מציע להפוך ל-isActive=false במקום.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("packages.catalog_manage");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;

    const purchaseCount = await prisma.userPackagePurchase.count({
      where: { packageId: id },
    });

    if (purchaseCount > 0) {
      return NextResponse.json(
        {
          message: `לא ניתן למחוק — קיימות ${purchaseCount} רכישות. במקום, סמן/י כלא-פעילה.`,
        },
        { status: 400 }
      );
    }

    const pkg = await prisma.package.findUnique({ where: { id } });
    if (!pkg) {
      return NextResponse.json({ message: "חבילה לא נמצאה" }, { status: 404 });
    }

    await withAudit(
      { kind: "user", session },
      {
        action: "delete_sms_package",
        targetType: "Package",
        targetId: id,
        details: { name: pkg.name, credits: pkg.credits },
      },
      async (tx) => tx.package.delete({ where: { id } })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[admin/sms-packages/[id]] DELETE error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת החבילה" },
      { status: 500 }
    );
  }
}
