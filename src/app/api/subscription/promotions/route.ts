import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { getActivePromotionForUser } from "@/lib/promotions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { aiTier: true, subscriptionStatus: true },
    });

    if (!user) {
      return NextResponse.json({ promotions: [] });
    }

    const hasActive = user.subscriptionStatus === "ACTIVE" || user.subscriptionStatus === "TRIALING";
    const promotion = await getActivePromotionForUser(userId, user.aiTier, hasActive);

    return NextResponse.json({
      promotions: promotion
        ? [{
            id: promotion.id,
            title: promotion.title,
            description: promotion.description,
            discountPercent: promotion.discountPercent,
            validUntil: promotion.validUntil,
            targetAudience: promotion.targetAudience,
          }]
        : [],
    });
  } catch (error) {
    logger.error("[subscription/promotions] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ promotions: [] });
  }
}
