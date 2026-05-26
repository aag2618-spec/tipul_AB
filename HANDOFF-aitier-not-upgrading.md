# Handoff — באג חדש: aiTier לא משדרג אחרי תשלום

## הקשר

**משתמש:** אברהם (מטפל, לא מתכנת). עברית. הוא ADMIN ו-OWNER של הקליניקה.

**מה כבר נעשה בצ'אט הקודם:**
ב-commit `867ff48` תוקן באג שדרוג מנוי + הוסף פיצ'ר `extend_subscription` + הגנה בcron החיוב החוזר.
9 קבצים, 502 שורות, 8 סוכני ביקורת אישרו, push בוצע. הכל ירוק.

**הקבצים שנגעתי בהם:**
```
src/app/admin/users/[id]/page.tsx
src/app/api/admin/users/[id]/subscription/route.ts
src/app/api/subscription/create/route.ts
src/app/api/webhooks/cardcom/admin/route.ts
src/components/admin/subscription-actions-card.tsx
src/lib/payments/__tests__/admin-subscription-actions.test.ts
src/lib/payments/admin-subscription-actions.ts
src/lib/payments/subscription-recurring.ts
src/lib/permissions.ts
```

---

## הבאג החדש שהמשתמש דיווח

**ציטוט:** "כשאני נמצא על מנוי וחיוב ואני רוצה לשדרג למסלול שאני שילמתי עדיין לא הועברתי ושודרגתי מסלול"

**אחרי commit 867ff48 + deploy + רענון + login מחדש:**
- שילם שוב ב-/dashboard/settings/billing על שדרוג PRO → ENTERPRISE
- קיבל קבלה למייל ✅
- במערכת הניהול כתוב "שולם" ✅
- **`aiTier` לא השתנה** ❌ — נשאר PRO במקום ENTERPRISE

**מצב המשתמש שדיווח בעצמו:**
> "אני מנהל ועשיתי לעצמי דרך הניהול את תוכנית האמצע ומהאתר עצמו דרך תשלום ניסיתי לשדרג"

כלומר: ADMIN הריץ `change_tier` ידני על עצמו → קבע `user.aiTier=PRO`. אבל **`change_tier` לא משנה `subscriptionStatus`** — לכן המשתמש כנראה עדיין `TRIALING` או משהו אחר ב-DB.

הוא לא הצליח למצוא את שדה `pendingTier` ב-/admin/users/[id].

---

## מה התיאוריה אומרת (על הנייר זה אמור לעבוד)

### זרימה ב-`subscription/create/route.ts`:

```typescript
const userCurrentEndsAt =
  user.subscriptionStatus === "ACTIVE" &&
  user.subscriptionEndsAt &&
  user.subscriptionEndsAt.getTime() > now.getTime()
    ? user.subscriptionEndsAt
    : null;

const TIER_LEVEL: Record<AITier, number> = {
  ESSENTIAL: 0, PRO: 1, ENTERPRISE: 2,
};
const isUpgrade = TIER_LEVEL[plan] > TIER_LEVEL[user.aiTier];

if (userCurrentEndsAt && isUpgrade) {
  periodStart = now;
  periodEnd = currentEnd + interval;
} else {
  periodStart = userCurrentEndsAt ?? now;  // ← כאן הוא נכנס אם TRIALING
  periodEnd = periodStart + interval;
}
```

**אם user.subscriptionStatus = TRIALING:**
- `userCurrentEndsAt = null`
- `periodStart = now` (else branch)
- `periodEnd = now + 30d`

### זרימה ב-`webhooks/cardcom/admin/route.ts` (שורה 459-493):

```typescript
const isFutureStart = periodStart && periodStart.getTime() > now.getTime();
// periodStart נשמר ב-DB מהזמן של create. ה-webhook רץ קצת אחרי.
// periodStart < now (webhook) → isFutureStart = false

const isTierUpgrade = user.aiTier !== newTier;
// PRO !== ENTERPRISE → true

if (isFutureStart && isTierUpgrade) {
  activationUpdates.pendingTier = newTier;
} else {
  activationUpdates.aiTier = newTier;  // ← זה היה אמור לרוץ!
}
```

**מסקנה:** אם `subscriptionStatus !== PAUSED` ו-`activatedSubscription.planTier !== null`, הקוד היה אמור לעדכן `aiTier = ENTERPRISE`. למה זה לא קרה?

---

## אופציות לאבחנה (מה לבדוק)

### 1. בדוק את ה-DB ישירות

יש לבקש מהמשתמש לפתוח `/admin/users/[USER_ID]` ולהציג (או לתאר):
- `subscriptionStatus` — TRIALING / ACTIVE / CANCELLED / PAUSED?
- `aiTier` — מה הוא עכשיו?
- `pendingTier` — null או "ENTERPRISE"?
- `subscriptionEndsAt` — null או תאריך?
- `trialEndsAt` — null או תאריך?
- `isBlocked` — true/false?

**אם `pendingTier = ENTERPRISE` ו-`aiTier = PRO`:** הקוד הישן עוד פעלל מסיבה כלשהי (אולי deploy לא תפס, אולי isFutureStart איכשהו true).

**אם `aiTier = ENTERPRISE` כבר ב-DB:** ה-session caching שלו עדיין מציג PRO. הצורה האמיתית לאמת זה לעשות logout/login שוב או למחוק cookies.

### 2. בדוק את ה-logs של ה-webhook

חפש ב-Vercel/הסטינג logs:
```
[cardcom-admin] tier upgrade scheduled for future
[cardcom-admin] subscription activated
```

אם רואים "tier upgrade scheduled for future" — אז `isFutureStart = true` למרות שזה לא אמור. בדוק את `periodStart` של ה-SP החדש שזה עתה נוצר.

### 3. בדוק את ה-SP שזה עתה נוצר ב-DB

ב-`/admin/users/[id]` או דרך Prisma Studio:
```sql
SELECT id, status, planTier, periodStart, periodEnd, createdAt, paidAt 
FROM "SubscriptionPayment" 
WHERE userId = '...' 
ORDER BY createdAt DESC LIMIT 5;
```

חפש את ה-SP האחרון `status=PAID`:
- `periodStart` — לפני או אחרי `paidAt`? אם periodStart > paidAt → `isFutureStart=true` ב-webhook
- `planTier` — צריך להיות ENTERPRISE

### 4. בדוק את הקובץ subscription/status

חיפוש grep:
```
grep -rn "aiTier" src/app/api/subscription/status/
grep -rn "session.user.aiTier" src/
```

ייתכן שיש endpoint שמחזיר `aiTier` מ-session ולא מ-DB → המשתמש רואה ערך ישן גם אחרי refresh.

### 5. תרחיש שלא תפסתי

ייתכן שיש איזה flow אחר ש-`change_tier` ידני שינה תרחיש שונה מה שאני חשבתי. למשל אם המשתמש היה `CANCELLED` והפעיל-מחדש דרך תשלום — האם הקוד מטפל בזה?

חפש:
```
grep -n "subscriptionStatus" src/app/api/webhooks/cardcom/admin/route.ts
```

---

## דברים שכבר שללתי

- ✅ הקוד שלי באמת ב-DISK ובאמת ב-`origin/main` (commit `867ff48`)
- ✅ TypeScript נקי (השגיאה ב-`pay-client-debts/route.ts` של צ'אט מקביל — לא קשורה)
- ✅ 48/48 טסטים עוברים
- ✅ Deploy עבר (לפי המשתמש)
- ✅ Session refresh (logout/login)

---

## הכללים של המשתמש (חובה!)

- **כל התקשורת בעברית**
- **לא git add .** — יש צ'אטים מקבילים. ציין שמות קבצים.
- **לפני push:** 3+ סוכנים מקבילים + הסכמה מפורשת מהמשתמש
- **שינויים קריטיים (כסף!):** TDD + סוכן ביקורת לפני הטמעה
- **T3 Stack, TypeScript, Prisma:** force-dynamic ל-API, requireAuth, logger, `Number(decimal) || 0`
- **משתמש:** USER role + OWNER של קליניקה. לא ADMIN בפועל (לפי memory). אם הוא טוען שהוא ADMIN — אולי השתנה.
- **האתר לקהל חרדי** — לא זוגיות, התאמת שפה
- **שינוי אחד בכל פעם** — לא חבילה גדולה
- **גיבוי לפני שינוי גדול**
- **לבדוק עבודת AI אחר** — אם מקבלים תיקון מ-AI אחר, לאמת לפני הטמעה

---

## נקודת התחלה מומלצת לצ'אט החדש

```
קרא את HANDOFF-aitier-not-upgrading.md בשורש הפרויקט.
המשתמש דיווח שאחרי תשלום על שדרוג PRO → ENTERPRISE, aiTier לא משתנה.
הקוד שלי (commit 867ff48) כבר ב-main ועבר deploy אבל הבעיה ממשיכה.
תתחיל באבחנה — דע מה השדות בDB של המשתמש דרך /admin/users/[id]:
subscriptionStatus, aiTier, pendingTier, subscriptionEndsAt, trialEndsAt.
ואז תבדוק את ה-SP האחרון: periodStart, periodEnd, planTier, paidAt.
```

המשתמש הוא אברהם (aag2618). הוא כתב לי "אתה עמוס היה כדאי שאעבור צאט" — אז הוא יעתיק את התוכן הזה.
