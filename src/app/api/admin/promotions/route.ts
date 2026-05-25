import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { z } from "zod";
import { parseBody } from "@/lib/validations/helpers";

export const dynamic = "force-dynamic";

const createPromotionSchema = z.object({
  title: z.string().trim().min(1, "חובה להזין כותרת").max(200),
  description: z.string().max(2000).optional().nullable(),
  discountPercent: z.coerce.number().int().min(0).max(100),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date().optional().nullable(),
  isActive: z.boolean().default(true),
  targetAudience: z.enum(["NEW_SUBSCRIBERS", "UPGRADERS", "ALL"]).default("ALL"),
});

const updatePromotionSchema = createPromotionSchema.partial().extend({
  id: z.string().min(1),
});

export async function GET() {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    const promotions = await prisma.promotion.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ promotions });
  } catch (error) {
    logger.error("[admin/promotions] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה בטעינת מבצעים" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    const parsed = await parseBody(req, createPromotionSchema);
    if ("error" in parsed) return parsed.error;

    const promotion = await prisma.promotion.create({
      data: parsed.data,
    });

    logger.info("[admin/promotions] created", {
      promotionId: promotion.id,
      title: promotion.title,
    });

    return NextResponse.json({ promotion }, { status: 201 });
  } catch (error) {
    logger.error("[admin/promotions] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה ביצירת מבצע" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    const parsed = await parseBody(req, updatePromotionSchema);
    if ("error" in parsed) return parsed.error;

    const { id, ...updateData } = parsed.data;

    const promotion = await prisma.promotion.update({
      where: { id },
      data: updateData,
    });

    logger.info("[admin/promotions] updated", {
      promotionId: promotion.id,
    });

    return NextResponse.json({ promotion });
  } catch (error) {
    logger.error("[admin/promotions] PUT error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה בעדכון מבצע" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ message: "חסר מזהה מבצע" }, { status: 400 });
    }

    await prisma.promotion.delete({ where: { id } });

    logger.info("[admin/promotions] deleted", { promotionId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[admin/promotions] DELETE error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה במחיקת מבצע" }, { status: 500 });
  }
}
