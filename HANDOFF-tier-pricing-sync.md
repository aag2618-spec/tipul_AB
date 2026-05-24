# HANDOFF — סנכרון מחירי tier-settings עם כל המערכת

**תאריך:** 2026-05-24
**הקשר:** המשתמש דיווח שעדכון מחיר ב-`/admin/tier-settings` (שמתעדכן ב-`TierLimits` model) לא מופיע בשום מקום אחר במערכת — לא בדף `/dashboard/settings/billing`, לא בכפתור "השלם באשראי" של Cardcom, לא בדף ההרשמה.

## מה תוקן (commit הזה)

### קבצים ששוניתי

1. **`src/lib/pricing/resolve.ts`**
   - הוספת שכבת fallback חדשה: TierLimits מ-DB לפני PRICING hardcoded
   - הוספת `source: "TIER_LIMITS"` חדש ל-union (במקום "GLOBAL" כפי שהיה תחילה)
   - הוספת פונקצית batch `fetchAndResolveSubscriptionPricesForTiers` (2 קריאות DB במקום 6 ל-3 tiers)
   - הוספת helper `deriveMultiPeriodPrices(monthly)` עם guard נגד 0/שלילי/NaN
   - נוסחת תקופות: quarterly=monthly×3×0.95, halfYear=monthly×6×0.9, yearly=monthly×10

2. **`src/app/api/subscription/tiers/route.ts`** — קובץ חדש
   - GET endpoint שמחזיר 3 tiers עם מחירים מותאמים אישית למשתמש המחובר
   - rate limit: `sub_tiers:${userId}` עם API_RATE_LIMIT (100/דקה)
   - לא מחזיר `source` ב-response (info disclosure prevention)

3. **`src/app/(dashboard)/dashboard/settings/billing/page.tsx`**
   - הסרת `PLANS` hardcoded — קורא ל-`/api/subscription/tiers` בכל mount
   - state חדש: `tiersError`, `subscriptionError`, `retryingTiers`
   - error UI fallback עם כפתור "נסה שוב" (RefreshCw + Loader2 animate-spin)
   - תקופות הנחה מחושבות לפי המחיר החודשי שמוחזר מה-API

4. **`src/app/api/subscription/status/route.ts`**
   - משתמש ב-`fetchAndResolveSubscriptionPrice` במקום `MONTHLY_PRICES` hardcoded
   - fallback ל-MONTHLY_PRICES (לא 0) אם resolver נכשל — מונע "₪0/חודש" מטעה

5. **`src/app/api/subscription/cancel/route.ts`**
   - `calculateFairPrice` ו-`calculateCancellationAdjustment` משתמשים ב-resolver
   - חישוב adjustment של ביטול מוקדם זהה לחישוב בדיאלוג ה-UI (אין drift)

## מה לא טופל — לסבב הבא

### 1. `src/app/api/cron/subscription-reminders/route.ts`

**הבעיה:** ה-cron שולח מיילי תזכורת לתום ניסיון / grace period / משלמים — וכולל מחיר מ-`MONTHLY_PRICES` hardcoded (שורות 8, 26, 641, 705, 758, 948).

**השפעה:** משתמש עם PricingPolicy מותאם (USER scope) או שינוי גלובלי ב-tier-settings — יקבל במייל מחיר שגוי. לא קריטי כי זה רק תצוגה במייל, לא חיוב.

**איך לתקן:** להחליף `MONTHLY_PRICES[tier]` בקריאה ל-`fetchAndResolveSubscriptionPrice` בתוך הלולאה (1 פעם לכל משתמש).

### 2. `src/app/api/webhooks/meshulam/route.ts`

**הבעיה:** `detectPeriodFromAmount` ב-pricing.ts מזהה תקופת חיוב לפי השוואה ל-PRICING hardcoded. למשתמש עם override של PricingPolicy, sum המתקבל מ-meshulam לא יתאים ל-PRICING → fallback ל-30 ימים תמיד.

**השפעה:** משתמש עם הסכם תמחור מיוחד שמשלם דרך meshulam — תקופת המנוי שלו עלולה להיות לא נכונה אחרי תשלום.

**איך לתקן:**
- אופציה A: לקבל את התקופה מ-PricingPolicy אם קיים (לפי matching לפי amount).
- אופציה B: עדיף — לקבל את התקופה ממטא-דאטה של ה-payment בעצמו (אם meshulam שולח), ולא להסתמך על השוואת סכומים.

### 3. טסטים חסרים

**הבעיה:** הפונקציה החדשה `fetchAndResolveSubscriptionPricesForTiers` ומסלול `source: "TIER_LIMITS"` אין להם כיסוי בטסטים pure (כי הם דורשים DB).

**איך לתקן:** ליצור integration test עם DATABASE_URL של staging או mock של prisma:
- test שמכניס TierLimits עם priceMonthly=100, מוחק את כל PricingPolicy, ובודק שה-resolver מחזיר source="TIER_LIMITS" + monthlyIls=100 + quarterly=285 + halfYear=540 + yearly=1000.
- test ל-batch: tier אחד עם policy + tier אחד עם TierLimits + tier אחד עם fallback.

### 4. תיעוד drift אפשרי

`src/lib/pricing.ts` עדיין מכיל PRICING/MONTHLY_PRICES hardcoded (117/145/220) כ-fallback אחרון. אם משתמש שינה ב-tier-settings, ושאלות המחיר התקופתיות חושבו מהנוסחה (×0.95/×0.9/×10), הן יהיו שונות מ-PRICING.

דוגמה ב-117:
- PRICING: 1=117, 3=333, 6=631, 12=1170
- נוסחה (TierLimits 117): 1=117, 3=Math.round(117×2.85)=333, 6=Math.round(117×5.4)=632, 12=1170

הבדל מינורי (1 ₪) ב-half-year. לא קריטי, אבל ראוי לתיעוד.

## בדיקות שעברו בסבב הזה

- TypeScript: נקי (`npx tsc --noEmit`)
- vitest resolver: 30/30 עוברים
- vitest כללי: 550 עוברים, 3 כשלים pre-existing (impersonation, sms-quota, clinic) — לא קשור לשינוי
- 3 סבבים של ביקורת AI (3 סוכנים × 3 סבבים = 9 ביקורות) — כולם אישרו push

## רגרסיה שאומתה

- ✅ `subscription/create` — קורא ל-resolver הקיים (לא שונה)
- ✅ cron `subscription-recurring-charge` — משתמש ב-`sp.amount` היסטורי (לא קורא resolver — by design)
- ✅ Cardcom webhooks — לא נוגעים ב-PRICING
- ✅ `admin/users/[id]/subscription` — קורא ל-resolver (לא שונה)
- ✅ AI dashboard / ai-usage / stats — משתמשים ב-PRICING ישירות, השינוי שלי לא נוגע בהם
