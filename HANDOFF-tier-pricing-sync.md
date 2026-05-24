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

### 1. ~~`src/app/api/cron/subscription-reminders/route.ts`~~ ✅ תוקן בסבב 2 (commit הבא)

החלפנו את `MONTHLY_PRICES` hardcoded ב-`fetchAndResolveSubscriptionPrice` עבור כל משתמש בלולאה. נשאר fallback ל-MONTHLY_PRICES אם resolver נכשל.

### 2. ~~`src/app/api/webhooks/meshulam/route.ts`~~ ✅ תוקן בסבב 2

הוספנו `detectPeriodForUser` שמשתמש ב-resolver לזיהוי תקופה לפי המחיר המותאם אישית. exact match → approximate ±5 ש"ח → fallback ל-detectPeriodCentral.

### 3. ~~טסטים חסרים~~ ✅ נוסף בסבב 2

7 טסטים חדשים ל-`deriveMultiPeriodPrices` (happy path + guards). Integration tests ל-`fetchAndResolveSubscriptionPricesForTiers` עדיין דורשים DB — נדחה.

---

## מה עדיין לא טופל (out-of-scope לסבבים האלה)

### A. N+1 ב-cron subscription-reminders (perf)

**הבעיה:** כל user בלולאה עושה 2 קריאות DB (PricingPolicy + TierLimits). ב-100 משתמשים ביום = ~200 קריאות נוספות.

**איך לתקן:** prefetch של כל ה-TierLimits בתחילת ה-cron, ולעשות in-memory resolve. או להוסיף batch function דומה ל-`fetchAndResolveSubscriptionPricesForTiers` אבל לרשימת users.

**עדיפות:** נמוכה — cron יומי, לא בעיה לתפעול.

### B. yearly mismatch בין getPriceForPeriod ל-deriveMultiPeriodPrices

**הבעיה:** `getPriceForPeriod(price, 12)` עם yearlyIls=null מחזיר `monthly*12`. אבל `deriveMultiPeriodPrices(monthly).yearly` הוא `monthly*10`. משתמש עם PricingPolicy שיש בו monthlyIls בלבד (בלי yearlyIls) יקבל מחיר אחר ממשתמש עם TierLimits.

**איך לתקן:** להחליט ארכיטקטונית — האם PricingPolicy עם monthlyIls בלבד אומר "אין הנחה תקופתית" (12×) או "הנחה סטנדרטית" (10×). אם הראשון — לתעד. אם השני — לעדכן `getPriceForPeriod` להשתמש ב-`deriveMultiPeriodPrices` כ-fallback.

**עדיפות:** בינונית — לפני שיוצרים PricingPolicy עם monthlyIls בלבד דרך UI הניהול.

### C. IDOR פוטנציאלי דרך customerEmail spoofing ב-meshulam webhook

**הבעיה (pre-existing — לא חולשה שנוצרה בסבב הזה):** ב-handlers של subscription (`subscription.created`, `subscription.renewed`, וגם payment.success ב-customerId path), המשתמש נמצא לפי `customerEmail` מה-payload — לא דרך `verifyPaymentOwnership` כמו במסלול payment-של-מטופל. תוקף עם HMAC secret + timestamp תקף יכול לזייף email של משתמש אחר.

**הגנה קיימת:** HMAC verification (דורש secret) + replay protection (5 דקות) + claimWebhook idempotency. ההגנות הוואלידיות מצמצמות את החולשה משמעותית.

**איך לתקן:** cross-check בין `customerEmail` ל-`customerId` של Meshulam (לוודא שה-email תואם ל-customer ID שמוכר), או signature שמאגדת את הpayload כולל email.

**עדיפות:** בינונית-גבוהה — אבל **לא רגרסיה חדשה**, חולשה קיימת. דורש סבב אבטחה נפרד.

### D. billingPaidByClinic לא מסונן בכל בלוקי cron-reminders

**הבעיה (pre-existing):** רק safety net של PAST_DUE (שורה 585) מסנן `billingPaidByClinic`. שאר הבלוקים (תזכורות 7d/3d/1d, grace, חסימה) שולחים מייל גם למשתמש שהקליניקה משלמת עליו.

**איך לתקן:** להוסיף `billingPaidByClinic: false` לפילטרים בכל ה-5 queries.

**עדיפות:** נמוכה — UX issue (משתמש מקבל מייל מטריד), לא קריטי.

### E. Integration tests ל-batch function ול-TIER_LIMITS source

**הבעיה:** הטסטים הקיימים הם pure (ללא DB). הפונקציה `fetchAndResolveSubscriptionPricesForTiers` ומסלול `source: "TIER_LIMITS"` אין להם כיסוי.

**איך לתקן:** integration test עם DATABASE_URL של staging או mock של prisma.

**עדיפות:** נמוכה.

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
