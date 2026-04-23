import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

// GET - Get single coupon
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("packages.catalog_manage");
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const coupon = await prisma.coupon.findUnique({
      where: { id },
      include: {
        usages: {
          include: {
            user: {
              select: { id: true, name: true, email: true, createdAt: true },
            },
          },
          orderBy: { usedAt: "desc" },
        },
      },
    });

    if (!coupon) {
      return NextResponse.json({ message: "קופון לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(coupon);
  } catch (error) {
    logger.error("Get coupon error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הקופון" },
      { status: 500 }
    );
  }
}

// PATCH - Update coupon
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
    const { name, type, maxUses, trialDays, validUntil, isActive, discount } = body;

    const previous = await prisma.coupon.findUnique({
      where: { id },
      select: { code: true, discount: true, trialDays: true, isActive: true, maxUses: true },
    });

    const coupon = await withAudit(
      { kind: "user", session },
      {
        action: "update_coupon",
        targetType: "coupon",
        targetId: id,
        details: {
          patch: body,
          previousValues: previous
            ? {
                discount: Number(previous.discount) || 0,
                trialDays: previous.trialDays,
                isActive: previous.isActive,
                maxUses: previous.maxUses,
              }
            : null,
        },
      },
      async (tx) =>
        tx.coupon.update({
          where: { id },
          data: {
            ...(name !== undefined && { name }),
            ...(type !== undefined && { type }),
            ...(maxUses !== undefined && { maxUses }),
            ...(trialDays !== undefined && { trialDays }),
            ...(discount !== undefined && { discount }),
            ...(isActive !== undefined && { isActive }),
            ...(validUntil !== undefined && {
              validUntil: validUntil ? new Date(validUntil) : null,
            }),
          },
        })
    );

    return NextResponse.json(coupon);
  } catch (error) {
    logger.error("Update coupon error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הקופון" },
      { status: 500 }
    );
  }
}

// DELETE - Delete coupon
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("packages.catalog_manage");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;

    const existing = await prisma.coupon.findUnique({
      where: { id },
      select: { code: true, name: true, type: true, discount: true, trialDays: true },
    });

    if (!existing) {
      return NextResponse.json({ message: "קופון לא נמצא" }, { status: 404 });
    }

    await withAudit(
      { kind: "user", session },
      {
        action: "delete_coupon",
        targetType: "coupon",
        targetId: id,
        details: {
          code: existing.code,
          name: existing.name,
          type: existing.type,
          discount: Number(existing.discount) || 0,
          trialDays: existing.trialDays,
        },
      },
      async (tx) => {
        await tx.coupon.delete({ where: { id } });
      }
    );

    return NextResponse.json({ message: "הקופון נמחק בהצלחה" });
  } catch (error) {
    logger.error("Delete coupon error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת הקופון" },
      { status: 500 }
    );
  }
}
