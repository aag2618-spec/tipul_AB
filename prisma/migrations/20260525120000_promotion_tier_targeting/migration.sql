-- הוספת סינון לפי מסלול נוכחי ומסלול יעד להנחה
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "forCurrentTier" "AITier";
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "discountOnTier" "AITier";
