import prisma from "@/lib/prisma";
import type { AITier, PromotionTarget } from "@prisma/client";

const TIER_LEVEL: Record<AITier, number> = {
  ESSENTIAL: 0,
  PRO: 1,
  ENTERPRISE: 2,
};

const MAX_TIER_LEVEL = Math.max(...Object.values(TIER_LEVEL));

export interface ActivePromotion {
  id: string;
  title: string;
  description: string | null;
  discountPercent: number;
  targetAudience: PromotionTarget;
  discountOnTier: AITier | null;
  validUntil: Date | null;
}

/**
 * מחזיר את המבצע הפעיל הרלוונטי למשתמש, או null אם אין.
 *
 * סינון:
 * - targetAudience: ALL לא כולל מי שכבר במסלול הגבוה ביותר
 * - forCurrentTier: אם מוגדר, רק משתמשים במסלול הזה רואים את המבצע
 * - discountOnTier: חוזר כחלק מהתוצאה — הצרכן מחליט על איזה tier להחיל
 */
export async function getActivePromotionForUser(
  userId: string,
  currentTier: AITier,
  hasActiveSubscription: boolean
): Promise<ActivePromotion | null> {
  const now = new Date();
  const isMaxTier = TIER_LEVEL[currentTier] >= MAX_TIER_LEVEL;

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
      targetAudience: true,
      forCurrentTier: true,
      discountOnTier: true,
      validUntil: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  for (const p of promotions) {
    if (p.discountPercent <= 0) continue;

    // סינון לפי מסלול נוכחי
    if (p.forCurrentTier && p.forCurrentTier !== currentTier) continue;

    // סינון לפי קהל יעד
    if (p.targetAudience === "ALL" && isMaxTier) continue;
    if (p.targetAudience === "NEW_SUBSCRIBERS" && hasActiveSubscription) continue;
    if (p.targetAudience === "UPGRADERS" && !hasActiveSubscription) continue;

    // הנחה על מסלול ספציפי — ודא שהוא גבוה מהנוכחי (אחרת אין טעם)
    if (p.discountOnTier && TIER_LEVEL[p.discountOnTier] <= TIER_LEVEL[currentTier]) continue;

    return p;
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
