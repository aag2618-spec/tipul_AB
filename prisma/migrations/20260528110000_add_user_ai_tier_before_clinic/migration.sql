-- M11.E1: aiTier inheritance from organization plan.
-- כש-billingPaidByClinic=true והארגון מספק aiTierIncluded — המשתמש יורש tier זה,
-- אך aiTier הקודם שלו נשמר ב-aiTierBeforeClinic כדי שנוכל לשחזר בעזיבה.
-- idempotent (IF NOT EXISTS) — בטוח לכשל פריסה חוזרת.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiTierBeforeClinic" "AITier";
