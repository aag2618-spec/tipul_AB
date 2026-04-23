import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

// GET - List all coupons
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requirePermission("packages.catalog_manage");
    if ("error" in auth) return auth.error;

    const coupons = await prisma.coupon.findMany({
      include: {
        usages: {
          include: {
            user: {
              select: { id: true, name: true, email: true, createdAt: true },
            },
          },
          orderBy: { usedAt: "desc" },
        },
        _count: {
          select: { usages: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(coupons);
  } catch (error) {
    logger.error("Get coupons error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הקופונים" },
      { status: 500 }
    );
  }
}

// POST - Create new coupon
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("packages.catalog_manage");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const body = await request.json();
    const { code, name, type, maxUses, trialDays, validUntil, discount } = body;

    if (!code || !name) {
      return NextResponse.json(
        { message: "נא למלא קוד ושם לקופון" },
        { status: 400 }
      );
    }

    const normalizedCode = code.trim().toUpperCase();

    // Check if code already exists
    const existingCoupon = await prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });

    if (existingCoupon) {
      return NextResponse.json(
        { message: "קוד קופון זה כבר קיים" },
        { status: 400 }
      );
    }

    const coupon = await withAudit(
      { kind: "user", session },
      {
        action: "create_coupon",
        targetType: "coupon",
        details: {
          code: normalizedCode,
          name: name.trim(),
          type: type || "LIMITED",
          discount: discount || 0,
          trialDays: trialDays || 30,
          validUntil: validUntil || null,
        },
      },
      async (tx) =>
        tx.coupon.create({
          data: {
            code: normalizedCode,
            name: name.trim(),
            type: type || "LIMITED",
            maxUses: type === "UNLIMITED" ? null : (maxUses || 1),
            trialDays: trialDays || 30,
            discount: discount || 0,
            validUntil: validUntil ? new Date(validUntil) : null,
          },
        })
    );

    return NextResponse.json(coupon, { status: 201 });
  } catch (error) {
    logger.error("Create coupon error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הקופון" },
      { status: 500 }
    );
  }
}
