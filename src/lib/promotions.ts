import prisma from "@/lib/prisma";
import type { PromotionTarget } from "@prisma/client";

export interface ActivePromotion {
  id: string;
  title: string;
  discountPercent: number;
  targetAudience: PromotionTarget;
}

/**
 * מחזיר את המבצע הפעיל הרלוונטי למשתמש, או null אם אין.
 * בודק targetAudience: ALL תמיד מתאים, NEW_SUBSCRIBERS רק למי שאין מנוי פעיל,
 * UPGRADERS רק למי שכבר יש מנוי.
 */
export async function getActivePromotionForUser(
  userId: string,
  hasActiveSubscription: boolean
): Promise<ActivePromotion | null> {
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
      discountPercent: true,
      targetAudience: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  for (const p of promotions) {
    if (p.discountPercent <= 0) continue;

    if (p.targetAudience === "ALL") return p;
    if (p.targetAudience === "NEW_SUBSCRIBERS" && !hasActiveSubscription) return p;
    if (p.targetAudience === "UPGRADERS" && hasActiveSubscription) return p;
  }

  return null;
}

/**
 * מחיל הנחת מבצע על מחיר. מחזיר את המחיר אחרי הנחה (מינימום 1 ש"ח).
 */
export function applyPromotionDiscount(price: number, discountPercent: number): number {
  if (discountPercent <= 0 || !Number.isFinite(discountPercent)) return price;
  const discounted = Math.round(price * (1 - discountPercent / 100));
  return Math.max(discounted, 1);
}
