# Handoff — תיקון באג שדרוג מנוי + פיצ'ר extend_subscription

## הקשר

המשתמש (אברהם, מטפל, לא מתכנת) דיווח על באג:
> "כשאני נמצא על מנוי וחיוב ואני רוצה לשדרג למסלול שאני שילמתי עדיין לא הועברתי ושודרגתי מסלול"

כלומר: משלם בעמוד `/dashboard/settings/billing` על שדרוג, אבל aiTier לא מתעדכן.

## האבחנה

ב-`src/app/api/subscription/create/route.ts` הלוגיקה הקיימת קבעה:
- משתמש ACTIVE עם `subscriptionEndsAt` בעתיד → `periodStart = subscriptionEndsAt` (התקופה החדשה מתחילה אחרי הקיימת)

זה גרם ל-webhook `src/app/api/webhooks/cardcom/admin/route.ts` להגדיר:
- `isFutureStart = true` + `isTierUpgrade = true` → `pendingTier=newTier`, **aiTier נשאר ישן** (עד שcron-promote יבצע את ההחלפה בעתיד).

המשתמש לא ראה שום שינוי אחרי התשלום.

## מה הוחלט (אופציה א של המשתמש)

**שדרוג מיידי + הארכת תקופה:**
- משתמש ACTIVE משדרג ל-tier יקר יותר → `periodStart=now`, `periodEnd=currentEnd+intervalDays` (הימים שכבר שולמו של ה-tier הישן "מתורגמים" לתוספת זמן ב-tier החדש).
- חידוש (אותו tier) או הורדה — נשארת ההתנהגות הישנה.

בנוסף, המשתמש ביקש להוסיף פעולת אדמין חדשה: **extend_subscription** — כפתור באדמין שמוסיף ימים ל-subscriptionEndsAt של משתמש פעיל (פיצוי על תקלות, מתנה).

## מה כבר עשיתי (הקבצים שלי בלבד — לא נשמרו ב-git!)

### 1. תיקון הבאג של השדרוג
**קובץ:** `src/app/api/subscription/create/route.ts`
- הוספתי `aiTier: true` ל-select של ה-user
- בניתי לוגיקה: `isUpgrade = PRICING[plan][1] > PRICING[user.aiTier][1]`
- אם משתמש ACTIVE + isUpgrade → `periodStart=now`, `periodEnd=currentEnd+interval`
- אחרת — אותה לוגיקה ישנה

### 2. helper חדש למינוי extend_subscription
**קובץ:** `src/lib/payments/admin-subscription-actions.ts`
- `MAX_SUBSCRIPTION_EXTENSION_DAYS = 365`
- `validateExtendSubscription({ days, note })` — days 1-365 + note ≥ 3 chars
- `calculateNewSubscriptionEndsAt({ currentEndsAt, daysToAdd, now })` — מחשב תאריך סיום חדש

### 3. טסטים
**קובץ:** `src/lib/payments/__tests__/admin-subscription-actions.test.ts`
- 13 טסטים חדשים (boundary, null, decimal, validation note)
- **48/48 עוברים**

### 4. הרשאה חדשה
**קובץ:** `src/lib/permissions.ts`
- `"users.extend_subscription"` rank=10 (ADMIN בלבד, לא ב-MANAGER list)

### 5. API handler
**קובץ:** `src/app/api/admin/users/[id]/subscription/route.ts`
- הוספתי `extend_subscription` ל-`ACTION_PERMISSIONS`
- `extendSubscriptionSchema` ב-zod discriminated union
- `handleExtendSubscription` — מעדכן `user.subscriptionEndsAt` + מעדכן SP פעיל (`nextChargeAt` + `periodEnd`)

### 6. UI דיאלוג
**קובץ:** `src/components/admin/subscription-actions-card.tsx`
- כפתור חדש "הוסף ימים למנוי" (אייקון CalendarPlus)
- דיאלוג עם input ימים (1-365) + textarea note + תצוגת before/after
- אזהרה אם אין subscriptionEndsAt

### 7. העברת prop
**קובץ:** `src/app/admin/users/[id]/page.tsx`
- מוסיף `subscriptionEndsAtIso={user.subscriptionEndsAt}` ל-`<SubscriptionActionsCard>`

---

## ⚠ באגים שמצאו 3 סוכנים מקבילים — חייבים לתקן לפני commit

### 🔴 קריטי #1 — periodEnd corrupted ע"י extend_subscription (סוכן UX)

ב-`handleExtendSubscription` (subscription/route.ts) אני מאריך גם את `SP.periodEnd` ב-X ימים.

**הבעיה:** ה-cron הבא (`chargeNextSubscription`) קורא `getPeriodMonthsFromDates(periodStart, periodEnd)` כדי לקבוע את התקופה. אם SP חודשי (30 ימים) הוארך ב-60 ימים → days=90 → הcron יחשוב שזה רבעוני → ייצור SP חדש של **3 חודשים חינם!**

**תיקון:** ב-`handleExtendSubscription`, להאריך **רק `nextChargeAt`**, לא `periodEnd`. (היזהר: גם להבין אם המשתמש.subscriptionEndsAt צריך להיוותר מסונכרן עם SP.periodEnd — כנראה לא נדרש כי המשתמש רואה רק את user.subscriptionEndsAt).

### 🔴 קריטי #2 — Race condition (סוכן קוד)

**הבעיה:** ה-cron של חיוב חוזר תופס lease ב-`updateMany` על שורת SP. אם אדמין לוחץ "הוסף ימים" בזמן שcron מעבד את אותו SP — ה-`SELECT FOR UPDATE` שלי הוא **רק על User**, לא חוסם את ה-UPDATE של ה-SP.

**תרחיש:** cron מתחיל לחייב → admin extend מוסיף 30 ימים ל-nextChargeAt של אותו SP → cron מסיים → יוצר SP חדש מבוסס על oldEnd הישן (בלי 30 הימים). הימים "אבדו".

**תיקון:** ב-`handleExtendSubscription`, להוסיף `SELECT FOR UPDATE` גם על ה-`SubscriptionPayment` (ולא רק על `User`). לדוגמה:
```typescript
if (activeSpId) {
  await tx.$executeRaw`SELECT 1 FROM "SubscriptionPayment" WHERE "id" = ${activeSpId} FOR UPDATE`;
}
```

### 🟠 חשוב #3 — אין rate-limit מצטבר (סוכן אבטחה)

**הבעיה:** ADMIN יכול לקרוא ל-`extend_subscription` ברצף (365+365+365...) להאריך מנוי לאינסוף — וקטור insider threat. ה-audit log מתעד אבל אין אכיפה אקטיבית.

**תיקון מומלץ (מורכב):**
- אופציה א: query `AdminAuditLog` ל-30 ימים אחרונים על אותו targetUserId, action='extend_subscription', sum(details.days) ≤ למשל 365 לשנה
- אופציה ב: שדה חדש ב-User למשל `subscriptionExtensionsThisYear` שמתאפס שנתית
- אופציה ג: dual control — אדמין שני חייב לאשר הארכות > 90 ימים

המשתמש (אברהם) **הסכים לדחות את זה** — המערכת לא בפרודקשן עדיין.

### 🟡 מינור #4 — isUpgrade עפ"י PRICING (סוכן קוד)

**הבעיה:** `isUpgrade = PRICING[plan][1] > PRICING[user.aiTier][1]` עובד נכון אבל מטעה — לא לוקח בחשבון `override_price` / `isFreeSubscription`.

**תיקון:** להחליף לקריטריון פשוט של דירוג tier:
```typescript
const TIER_LEVEL = { ESSENTIAL: 0, PRO: 1, ENTERPRISE: 2 } as const;
const isUpgrade = TIER_LEVEL[plan] > TIER_LEVEL[user.aiTier];
```

### 🟡 מינור #5 — אם אין SP פעיל (סוכן אבטחה)

אם משתמש בלי SP פעיל (קצה — אדמין מוסיף ימים למישהו ש"חופשי") — subscriptionEndsAt מתעדכן אבל nextChargeAt לא מסונכרן. לא בעיית אבטחה. המשתמש (אברהם) הסכים לדחות.

---

## מה נותר לעשות בצ'אט החדש

1. **חובה — תקן את 3 הקריטיים/חשובים:**
   - #1: ב-`handleExtendSubscription` להוריד את ההארכה של `periodEnd` — רק `nextChargeAt`
   - #2: להוסיף `SELECT FOR UPDATE` על ה-SP בנוסף ל-User
   - #4: לשנות `isUpgrade` לדירוג tier

2. **לא לעשות (לפי בקשת המשתמש):**
   - rate-limit מצטבר (#3) — נדחה לעתיד
   - SP מסונכרן כשאין SP (#5) — נדחה לעתיד

3. **לפני commit — להריץ שוב:**
   - `npx tsc --noEmit`
   - `npx vitest run --reporter=verbose src/lib/payments/__tests__/admin-subscription-actions.test.ts`
   - 3 סוכנים מקבילים נוספים (לפי `feedback_pre_push` של המשתמש)

4. **commit:**
   - **רק** הקבצים שלי (ראה רשימה למטה). **לא** `git add .` — יש צ'אט מקביל שעובד!
   - commit message בעברית קצר
   - לפני push — לוודא הסכמת המשתמש (`feedback_pre_push`)

---

## הקבצים שלי לקמיט (בלבד!)

```
src/app/admin/users/[id]/page.tsx
src/app/api/admin/users/[id]/subscription/route.ts
src/app/api/subscription/create/route.ts
src/components/admin/subscription-actions-card.tsx
src/lib/payments/__tests__/admin-subscription-actions.test.ts
src/lib/payments/admin-subscription-actions.ts
src/lib/permissions.ts
```

## ⛔ קבצים של הצ'אט המקביל — לא לגעת!

```
src/app/api/admin/billing/*
src/app/api/admin/chargebacks/*
src/app/api/admin/clinic-plans/*
src/app/api/admin/coupons/*
src/app/api/admin/custom-contracts/*
src/app/api/admin/pricing/package-policies/*
src/app/api/admin/pricing/policies/*
src/app/api/admin/receipts/*
src/app/api/admin/sms-packages/*
src/lib/validations/helpers.ts
src/lib/validations/billing.ts (חדש)
```

---

## פרטים טכניים על הקוד שכבר נכתב

### `subscription/create/route.ts` — הלוגיקה החדשה (קיים בקובץ עכשיו):

```typescript
const currentTierPrice = PRICING[user.aiTier]?.[1] ?? 0;
const newTierPrice = PRICING[plan]?.[1] ?? 0;
const isUpgrade = newTierPrice > currentTierPrice;  // ← #4 — לשנות לדירוג tier
const userCurrentEndsAt =
  user.subscriptionStatus === "ACTIVE" &&
  user.subscriptionEndsAt &&
  user.subscriptionEndsAt.getTime() > now.getTime()
    ? user.subscriptionEndsAt
    : null;
let periodStart: Date;
let periodEnd: Date;
if (userCurrentEndsAt && isUpgrade) {
  // שדרוג של משתמש ACTIVE — מיידי + הארכה
  periodStart = now;
  periodEnd = new Date(userCurrentEndsAt.getTime() + intervalDays * 86400000);
} else {
  // חידוש / הורדה / משתמש לא-ACTIVE
  periodStart = userCurrentEndsAt ?? now;
  periodEnd = new Date(periodStart.getTime() + intervalDays * 86400000);
}
```

### `handleExtendSubscription` — הקוד הנוכחי (לא מתוקן עדיין):

ב-`src/app/api/admin/users/[id]/subscription/route.ts` הקטע שמעדכן SP **טעון תיקון**:

```typescript
// ⚠ הקוד הנוכחי שמתחיל בעיה — לא לעדכן periodEnd!
if (activeSp) {
  await tx.subscriptionPayment.update({
    where: { id: activeSp.id },
    data: {
      nextChargeAt: activeSp.nextChargeAt
        ? new Date(activeSp.nextChargeAt.getTime() + daysInMs)
        : newSubscriptionEndsAt,
      periodEnd: activeSp.periodEnd  // ← ❌ להוריד את השורות האלו!
        ? new Date(activeSp.periodEnd.getTime() + daysInMs)
        : newSubscriptionEndsAt,
    },
  });
}
```

יש לשנות ל:
```typescript
if (activeSp) {
  // SELECT FOR UPDATE על ה-SP — חוסם race עם cron
  await tx.$executeRaw`SELECT 1 FROM "SubscriptionPayment" WHERE "id" = ${activeSp.id} FOR UPDATE`;
  await tx.subscriptionPayment.update({
    where: { id: activeSp.id },
    data: {
      // רק nextChargeAt — לא נוגעים ב-periodEnd כי הcron מחשב לפיו periodMonths
      nextChargeAt: activeSp.nextChargeAt
        ? new Date(activeSp.nextChargeAt.getTime() + daysInMs)
        : newSubscriptionEndsAt,
    },
  });
}
```

---

## הוראות עבודה של המשתמש (חובה לקרוא!)

- כל התקשורת בעברית
- לא לעשות `git add .` (יש צ'אט מקביל)
- לפני push — 3 סוכנים מקבילים + הסכמה מפורשת
- שינויים קריטיים (כסף!) → TDD + ביקורת
- T3 Stack, TypeScript, Prisma. כללי `force-dynamic`, `requireAuth`, `logger`, `Number(decimal) || 0`
- המשתמש = USER role + OWNER של קליניקה. לא ADMIN בפועל.
- האתר לקהל חרדי — לא זוגיות, התאמת שפה

---

## סטטוס סופי בצ'אט הקודם

- ✅ TypeScript נקי
- ✅ 48/48 טסטים עוברים
- ✅ 3 סוכנים מקבילים סיימו ביקורת
- ⏸ **טרם בוצע commit** — נדרשים תיקונים #1+#2+#4 לפני
- ⏸ **טרם בוצע push**
