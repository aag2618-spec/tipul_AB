import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;

    const now = new Date();

    const promotions = await prisma.promotion.findMany({
      where: {
        isActive: true,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      select: {
        id: true,
        title: true,
        description: true,
        discountPercent: true,
        validUntil: true,
        targetAudience: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return NextResponse.json({ promotions });
  } catch (error) {
    logger.error("[subscription/promotions] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ promotions: [] });
  }
}
