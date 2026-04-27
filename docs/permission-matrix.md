# מטריצת הרשאות — MyTipul Admin API

**סטטוס:** שלב 0 — גרסה 7 (סגירת back-door של `subscriptionEndsAt: null`).
**תאריך:** 21.4.2026.
**מטרה:** הגדרה מפורשת של הרשאות ADMIN ו-MANAGER עבור כל 31 ה-routes של `/api/admin/*`, לפני הנגיעה במידלוור.

## ⚠️ תלות בסדר ביצוע — timezone קודם!

**שלב 1.0 של `timezone-audit.md` (הוספת `date-utils.ts` + החלפה ב-20 מקומות) חייב להתבצע לפני שלב 1.5 של מסמך זה** (המעבר ב-30 routes ל-`requirePermission`).

הסיבה: שלב 1.5 ייתקל ב-30+ מקומות שמשתמשים ב-`requireAdmin()`. חלק מהם (`admin/stats`, `admin/ai-stats`, `admin/audit-log`) סובלים מבאגי timezone שיתוקנו ב-1.0. שילוב שני השינויים באותו commit יגרום ל-diff ענק וסיכון שבירה גבוה.

**סדר מומלץ:** 1.0 (timezone) → 1.1-1.4 (helpers) → 1.5 (מעבר routes) → 1.6+ (audit, schema, וכו').

## שינויים מגרסה 3 (סיבוב תיקונים שלישי)

1. **תוקן dead ternary** בדוגמת הקוד של הבהרה 1 — `extendDays` דורש תמיד `users.extend_trial_14d`, האכיפה המספרית ב-handler.
2. **נוסף `users.update_basic`** — permission חדש ל-MANAGER לעדכון name/email/phone. במקום fallback מבלבל ל-`users.view`.
3. **נוספה הבהרה 12** — `users.reset_password` אסור לשמש על ADMIN (מונע privilege escalation).
4. **נוסף `PERMISSION_RANK` + חתימת `requireHighestPermission`** (הבהרה 13).
5. **הוחלט על הבהרה 7** — אפשרות ב' (להפשיט PUT לשדות בסיסיים בלבד).

## שינויים מגרסה 2 (לאחר ביקורת נוספת)

1. **🟢 תיקון פספוס על `grantFree`:** גרסה 2 טענה שאין מנגנון `freeDays` — **זה לא נכון**. ה-UI מחשב `endDate = now + days × 24h` ושולח כ-`subscriptionEndsAt`; השרת מקבל ומגדיר (שורות 237-239). לכן **MANAGER עד 30 יום עובד היום, רק לא נאכף**.
2. **שורות 36, 40, 46** עודכנו: `grantFree` ל-MANAGER מתאפשר עם אכיפה על `subscriptionEndsAt - now ≤ 30 יום`.
3. **דוגמת קוד ב-הבהרה 1** עודכנה — pattern של "collect required permissions, then require max" (במקום `else if`).
4. **`revokeFree`** — מעבר ל-`users.revoke_free` נפרד (במקום permission של הענקה).
5. **הבהרה על trials grantFree** — ה-endpoint **לא** מקבל `subscriptionEndsAt`. דורש תוספת קוד קטנה בשלב 1 לפני שמאפשרים ל-MANAGER.

## שינויים מגרסה 1 (לאחר ביקורת קוד ראשונה)

1. **🚨 פגיעות:** `PUT /users/[id]` מקבל `role` ו-`aiTier` בלי בדיקה — זהה ל-PATCH.
2. **ספירת endpoints** — 53 (לא 57).
3. **Middleware מחריג 2 ראוטים** — `reset-password` **וגם** `backfill-user-numbers`.
4. **`trials PATCH`** — פיצול לפי `action` בגוף, לא לפי שדה body.
5. **PATCH ב-`users/[id]`** — `if` נפרדים (לא `else if`) → combos לגיטימיים ומכוונים מה-UI.

---

## הקשר

- **3 תפקידים** בסכמה: `USER` / `MANAGER` / `ADMIN`.
- **כרגע:** רק `ADMIN` מוגן ב-`src/middleware.ts` — `MANAGER` לא מופעל בפועל.
- **31 קבצי route = 53 endpoints** (`export async function (GET|POST|PUT|PATCH|DELETE)` בקוד הקיים).
- **ה-middleware מחריג 2 ראוטים:** `reset-password` (אימות דרך `x-admin-key`) ו-`backfill-user-numbers` (אימות דרך `Bearer CRON_SECRET`).

---

## עקרונות

1. **ADMIN הכל** — `hasPermission(ADMIN, *)` תמיד `true`.
2. **MANAGER = תפעול יומיומי** — יכול לעשות כל מה שנדרש למזכיר/ה שעונה ללקוחות.
3. **MANAGER לא יכול לגעת ב:** הגדרות מערכת, מחיקות, הרשאות, feature flags, מחירים.
4. **פעולות כספיות רגישות עם MANAGER** (`payments.manual`, `packages.grant_manual`) — כן מותרות, אבל מתועדות ב-audit בלבד.
5. **MANAGER לא מוחק** — אם דרושה מחיקה (משתמש, קופון, feature flag) → ADMIN בלבד.

---

## מקרא

- **✅** — מותר
- **❌** — אסור (מחזיר 403)
- **🔒** — מותר **אבל עם הגבלה** (למשל: `grantFree` רק עד 30 יום)
- **📝** — מותר **עם audit חובה** + `note` אם MANUAL
- **🛡️** — ADMIN בלבד גם בקריאה (מידע רגיש)

---

## המטריצה המלאה

### A) קריאה בלבד (READ) — MANAGER רואה הכל שנחוץ לעבודה

| # | Route | Method | Permission | ADMIN | MANAGER | USER | הערות |
|---|---|---|---|---|---|---|---|
| 1 | `/api/admin/ai-dashboard` | GET | `users.view` | ✅ | ✅ | ❌ | סקירת AI לכל המשתמשים |
| 2 | `/api/admin/ai-stats` | GET | `users.view` | ✅ | ✅ | ❌ | סטטיסטיקות יומיות |
| 3 | `/api/admin/api-usage` | GET | `users.view` | ✅ | ✅ | ❌ | לוג קריאות API + עלויות |
| 4 | `/api/admin/api-usage/stats` | GET | `users.view` | ✅ | ✅ | ❌ | אגרגציות API |
| 5 | `/api/admin/audit-log` | GET | `audit.view_per_user` / `audit.view_all` | ✅ | 🔒 | ❌ | MANAGER רואה **רק פעולות על משתמש ספציפי**. ADMIN רואה הכל. |
| 6 | `/api/admin/search` | GET | `users.view` | ✅ | ✅ | ❌ | חיפוש משתמשים מהיר |
| 7 | `/api/admin/stats` | GET | `users.view` | ✅ | ✅ | ❌ | MRR, ARR, churn, funnel |
| 8 | `/api/admin/storage` | GET | `users.view` | ✅ | ✅ | ❌ | שימוש אחסון לכל משתמש |
| 9 | `/api/admin/subscribers` | GET | `users.view` | ✅ | ✅ | ❌ | חיפוש מנויים + סטטיסטיקה |
| 10 | `/api/admin/trials` | GET | `users.view` | ✅ | ✅ | ❌ | משתמשי ניסיון |
| 11 | `/api/admin/users` | GET | `users.view` | ✅ | ✅ | ❌ | רשימת כל המשתמשים |
| 12 | `/api/admin/users/[id]` | GET | `users.view` | ✅ | ✅ | ❌ | פרטי משתמש |
| 13 | `/api/admin/support` | GET | `support.respond` | ✅ | ✅ | ❌ | פניות תמיכה |
| 14 | `/api/admin/support/[id]` | GET | `support.respond` | ✅ | ✅ | ❌ | פנייה בודדת |
| 15 | `/api/admin/terms` | GET | `settings.terms` | ✅ | 🛡️ | ❌ | ADMIN בלבד — מסמך משפטי |
| 16 | `/api/admin/coupons` | GET | `packages.catalog_manage` | ✅ | 🛡️ | ❌ | ADMIN בלבד (קופונים = פיננסי) |
| 17 | `/api/admin/coupons/[id]` | GET | `packages.catalog_manage` | ✅ | 🛡️ | ❌ | ADMIN בלבד |
| 18 | `/api/admin/feature-flags` | GET | `settings.feature_flags` | ✅ | 🛡️ | ❌ | ADMIN בלבד |
| 19 | `/api/admin/ai-settings` | GET | `settings.pricing` | ✅ | 🛡️ | ❌ | ADMIN בלבד (כוללים budget/limits) |
| 20 | `/api/admin/tier-limits` | GET | `settings.pricing` | ✅ | 🛡️ | ❌ | ADMIN בלבד |

### B) כתיבה — פעולות יומיומיות של מזכיר

| # | Route | Method | Permission | ADMIN | MANAGER | USER | הערות |
|---|---|---|---|---|---|---|---|
| 21 | `/api/admin/users` | POST | `users.create` | ✅ | 📝 | ❌ | יצירת משתמש חדש + audit |
| 22 | `/api/admin/users/[id]` | PUT | **🚨 split חובה** (ראו הבהרה 7) | ✅ | 🔒📝 | ❌ | **פגיעות קיימת!** מקבל `role` ו-`aiTier` בלי בדיקה. MANAGER מוגבל ל-name/email/phone/password בלבד |
| 23 | `/api/admin/users/[id]/toggle-block` | POST | `users.block` | ✅ | 📝 | ❌ | חסימה/שחרור |
| 24 | `/api/admin/alerts` | GET | `users.view` | ✅ | ✅ | ❌ | קריאת התראות |
| 25 | `/api/admin/alerts` | POST | `users.view` | ✅ | 📝 | ❌ | יצירת התראה ידנית |
| 26 | `/api/admin/alerts/[id]` | GET | `users.view` | ✅ | ✅ | ❌ | התראה בודדת |
| 27 | `/api/admin/alerts/[id]` | PATCH | `users.view` | ✅ | 📝 | ❌ | שינוי סטטוס (resolved/dismissed) |
| 28 | `/api/admin/alerts/[id]` | DELETE | `users.view` | ✅ | 📝 | ❌ | ביטול התראה |
| 29 | `/api/admin/announcements` | GET | `settings.announcements` | ✅ | ✅ | ❌ | קריאת הודעות |
| 30 | `/api/admin/announcements` | POST | `settings.announcements` | ✅ | 📝 | ❌ | יצירת הודעה |
| 31 | `/api/admin/announcements/[id]` | PUT | `settings.announcements` | ✅ | 📝 | ❌ | עדכון הודעה |
| 32 | `/api/admin/support/[id]` | PATCH | `support.respond` | ✅ | 📝 | ❌ | עדכון סטטוס פנייה |
| 33 | `/api/admin/support/[id]` | POST | `support.respond` | ✅ | 📝 | ❌ | הוספת תגובת admin |

### C) כתיבה עסקית רגישה — MANAGER יכול, עם הגבלות ו-audit

| # | Route | Method | Permission | ADMIN | MANAGER | USER | הערות |
|---|---|---|---|---|---|---|---|
| 34 | `/api/admin/users/[id]` | PATCH (`aiTier`) | `users.change_tier` | ✅ | 📝 | ❌ | שינוי תוכנית |
| 35 | `/api/admin/users/[id]` | PATCH (`extendDays`) | `users.extend_trial_14d` | ✅ | 🔒📝 | ❌ | MANAGER עד 14 יום. מעל = ADMIN. |
| 36 | `/api/admin/users/[id]` | PATCH (`grantFree` + `subscriptionEndsAt` תוך 30 יום) | `users.grant_free_30d` | ✅ | 🔒📝 | ❌ | MANAGER עד 30 יום (אכיפה על `subscriptionEndsAt - now ≤ 30d`). ראו הבהרה 8. |
| 37 | `/api/admin/users/[id]` | PATCH (`revokeFree`) | `users.revoke_free` | ✅ | 📝 | ❌ | ביטול מנוי חינם — permission נפרד |
| 38 | `/api/admin/users/[id]` | PATCH (`subscriptionEndsAt` ≤ 30d) | `users.change_tier` | ✅ | 🔒📝 | ❌ | תאריך תפוגה (ללא `grantFree`). MANAGER עד 30 יום קדימה. מעל = ADMIN (ראו הבהרה 1, back-door closure) |
| 39 | `/api/admin/trials` | PATCH (`action: "block"/"unblock"`) | `users.block` | ✅ | 📝 | ❌ | פיצול לפי `action` בגוף |
| 40 | `/api/admin/trials` | PATCH (`action: "grantFree"`) | **⚠️ דורש תוספת קוד** (ראו הבהרה 8) | ✅ | ❌ | ❌ | ה-endpoint לא מקבל `subscriptionEndsAt` — ADMIN-only עד שמוסיפים תמיכה. |
| 41 | `/api/admin/billing` | GET | `users.view` | ✅ | ✅ | ❌ | סקירת תשלומים |
| 42 | `/api/admin/billing` | POST | `payments.manual` | ✅ | 📝 | ❌ | תשלום ידני (חייב `note` אם MANUAL) |
| 43 | `/api/admin/billing/[id]` | PUT | `payments.manual` | ✅ | 📝 | ❌ | עדכון סטטוס תשלום |

### D) ADMIN בלבד — מחיקות, הגדרות מערכת, הרשאות

| # | Route | Method | Permission | ADMIN | MANAGER | USER | הערות |
|---|---|---|---|---|---|---|---|
| 44 | `/api/admin/users/[id]` | DELETE | `users.delete` | ✅ | ❌ | ❌ | מחיקת משתמש לצמיתות |
| 45 | `/api/admin/users/[id]` | PATCH (`role`) | `users.change_role` | ✅ | ❌ | ❌ | שינוי תפקיד (USER→MANAGER) |
| 46 | `/api/admin/users/[id]` | PATCH (`grantFree` + `subscriptionEndsAt > 30d` או חסר) | `users.grant_free_unlimited` | ✅ | ❌ | ❌ | חינם מעל 30 יום או ללא תאריך תפוגה |
| 47 | `/api/admin/billing/[id]` | DELETE | `payments.refund` | ✅ | ❌ | ❌ | מחיקת רשומת תשלום |
| 48 | `/api/admin/coupons` | POST | `packages.catalog_manage` | ✅ | ❌ | ❌ | יצירת קופון |
| 49 | `/api/admin/coupons/[id]` | PATCH | `packages.catalog_manage` | ✅ | ❌ | ❌ | עדכון קופון |
| 50 | `/api/admin/coupons/[id]` | DELETE | `packages.catalog_manage` | ✅ | ❌ | ❌ | מחיקת קופון |
| 51 | `/api/admin/announcements/[id]` | DELETE | `settings.announcements` | ✅ | ❌ | ❌ | מחיקת הודעה (MANAGER רק יוצר/מעדכן) |
| 52 | `/api/admin/feature-flags` | POST | `settings.feature_flags` | ✅ | ❌ | ❌ | יצירת feature flag |
| 53 | `/api/admin/feature-flags/[id]` | PUT | `settings.feature_flags` | ✅ | ❌ | ❌ | עדכון flag |
| 54 | `/api/admin/feature-flags/[id]` | DELETE | `settings.feature_flags` | ✅ | ❌ | ❌ | מחיקת flag |
| 55 | `/api/admin/ai-settings` | POST | `settings.pricing` | ✅ | ❌ | ❌ | עדכון הגדרות AI |
| 56 | `/api/admin/tier-limits` | PUT | `settings.pricing` | ✅ | ❌ | ❌ | עדכון מכסות tier |
| 57 | `/api/admin/tier-limits` | POST | `settings.pricing` | ✅ | ❌ | ❌ | איפוס מכסות |
| 58 | `/api/admin/set-admin` | POST | `users.change_role` | ✅ | ❌ | ❌ | העלאה ל-ADMIN |
| 59 | `/api/admin/backfill-user-numbers` | POST | (ADMIN בלבד) | ✅ | ❌ | ❌ | תחזוקה חד-פעמית |

### E) מקרה מיוחד — אימות חיצוני במקום session

| # | Route | Method | אימות | ADMIN | MANAGER | USER | הערות |
|---|---|---|---|---|---|---|---|
| 60 | `/api/admin/reset-password` | POST | `x-admin-key` header | 🔑 | ❌ | ❌ | **אין session.** משתמש ב-`ADMIN_SECRET` עם rate limit IP. נשאר ADMIN_ONLY. |

---

## סיכומים

### כמויות

| קטגוריה | מספר |
|---|---|
| **קבצי route בפועל** | 31 |
| **Endpoints בקוד (`export async function (GET\|POST\|PUT\|PATCH\|DELETE)`)** | 53 |
| **הרשאות לבדיקה** (אחרי split של PATCH לפי body field ו-PUT לפי שדות) | 60 |

**הסבר ההפרש:** `PATCH /users/[id]` ו-`PUT /users/[id]` ו-`PATCH /trials` מתפצלים ל-permissions שונות לפי תוכן הבקשה. כל split נספר כ-"הרשאה" נפרדת במטריצה.

### טיפוס `Permission` מלא (25 הרשאות)

לעדכון ב-`src/lib/permissions.ts`:

```ts
export type Permission =
  // קריאה
  | "users.view"
  | "audit.view_all"
  | "audit.view_per_user"

  // כתיבה רגילה (MANAGER)
  | "users.update_basic"       // חדש בגרסה 4 — name/email/phone
  | "users.block"
  | "users.reset_password"
  | "users.create"
  | "users.change_tier"
  | "users.extend_trial_14d"
  | "users.grant_free_30d"
  | "users.revoke_free"
  | "packages.grant_manual"
  | "packages.revert"
  | "payments.manual"
  | "support.respond"
  | "settings.announcements"

  // ADMIN בלבד
  | "users.change_role"
  | "users.grant_free_unlimited"
  | "users.delete"
  | "packages.catalog_manage"
  | "payments.refund"
  | "settings.billing_provider"
  | "settings.pricing"
  | "settings.feature_flags"
  | "settings.terms"
  | "idempotency.clear";
```

### הרשאות MANAGER (15 הרשאות — נוסף `users.update_basic`)

```ts
MANAGER: [
  "users.view",
  "users.update_basic",       // ← חדש בגרסה 4 (name/email/phone)
  "audit.view_per_user",
  "users.block",
  "users.reset_password",
  "users.create",
  "users.change_tier",
  "users.extend_trial_14d",
  "users.grant_free_30d",
  "users.revoke_free",
  "packages.grant_manual",    // מימוש עתידי
  "packages.revert",          // מימוש עתידי
  "payments.manual",
  "support.respond",
  "settings.announcements",
]
```

### ADMIN בלבד (10 הרשאות)

```
audit.view_all
users.grant_free_unlimited
users.change_role
users.delete
packages.catalog_manage
payments.refund
settings.billing_provider
settings.pricing
settings.feature_flags
settings.terms
idempotency.clear
```

---

## הבהרות קריטיות

### 1. `PATCH /api/admin/users/[id]` — לוגיקת split **חסרה לחלוטין בקוד הקיים**

הקובץ הזה מבצע **5 פעולות שונות** לפי body. כיום הוא קורא ל-`requireAdmin()` **פעם אחת** בלי בדיקה לפי השדה. זה יעבור אוטומטית ל-MANAGER ברגע שנאפשר MANAGER ב-middleware — **פגיעות מיידית**.

**בנוסף — הקוד משתמש ב-`if` נפרדים (לא `else if`)** — שורות 205, 216, 225, 237 ב-[src/app/api/admin/users/[id]/route.ts](src/app/api/admin/users/[id]/route.ts). משמעות: בקשה כמו `{grantFree: true, extendDays: 14}` **מבצעת שתיהן ביחד**.

**אימות UI נעשה — combo אמיתי ובשימוש!**

בדיקה של הדיאלוגים ב-[src/app/admin/billing/page.tsx](src/app/admin/billing/page.tsx) חשפה ש-`handleGrantFree()` (שורות 235-264) שולח **combo מכוון של 4 שדות**:
```ts
{ aiTier, grantFree: true, freeNote, subscriptionEndsAt }
```

**משמעות:** `else if` **ישבור** את ה-UI הקיים. חייבים לתמוך ב-combinations.

**ההחלטה:**
- **להשאיר `if` נפרדים** (תואם ל-UI).
- **לדרוש את ההרשאה הגבוהה ביותר** מכל השדות שבגוף הבקשה.
- דוגמה: combo של `{role: "ADMIN", grantFree: true}` — דורש `users.change_role` (ADMIN). combo של `{aiTier: "PRO", grantFree: true}` — דורש `users.grant_free_*`.

דיאלוגים שאומתו כ-`single-field`:
- `/admin/users` — `handleChangeTier()` → רק `aiTier`
- `/admin/billing` — `handleBlock()` → רק `isBlocked`
- `/admin/billing` — `handleExtend()` → רק `extendDays`
- `/admin/billing` — `handleRevokeFree()` → רק `revokeFree`

דיאלוג שאומת כ-`combo מכוון`:
- `/admin/billing` — `handleGrantFree()` → `aiTier + grantFree + freeNote + subscriptionEndsAt`
- `/admin/billing` — `handleChangeTier()` (עם מנוי חדש) → `subscriptionStatus + aiTier`

**זו בעיה שחייבים לתקן בשלב 1.5 (המעבר ב-30 ה-routes).** עד אז — **אין לשחרר MANAGER ב-middleware**. הדפוס הנכון הוא "collect required permissions, then require max" (לא `else if`, כדי לתמוך ב-combos המכוונים מה-UI):

```ts
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json();
  const required: Permission[] = [];

  // שינוי תפקיד — ADMIN בלבד
  if (body.role !== undefined) {
    required.push("users.change_role");
  }

  // grantFree — לפי subscriptionEndsAt (או חוסר בו)
  if (body.grantFree) {
    const days = body.subscriptionEndsAt
      ? Math.ceil((new Date(body.subscriptionEndsAt).getTime() - Date.now()) / 86400000)
      : Infinity;
    required.push(days > 30 ? "users.grant_free_unlimited" : "users.grant_free_30d");
  }

  // revokeFree — permission נפרד
  if (body.revokeFree) {
    required.push("users.revoke_free");
  }

  // הארכת ניסיון — אותה הרשאה למגבלה ומעל; האכיפה המספרית (MANAGER≤14, ADMIN>14) ב-handler
  if (body.extendDays && body.extendDays > 0) {
    required.push("users.extend_trial_14d");
  }

  // שינוי תוכנית / תאריך תפוגה
  if (body.aiTier !== undefined || body.subscriptionEndsAt !== undefined || body.subscriptionStatus !== undefined) {
    required.push("users.change_tier");
  }

  // שאר השדות (name, email, phone) — permission נפרד לעדכון בסיסי
  if (required.length === 0) {
    required.push("users.update_basic");
  }

  // דורש את ה-permission הגבוהה ביותר מכל הרשימה
  const auth = await requireHighestPermission(required);
  if ("error" in auth) return auth.error;

  // ...הלוגיקה עצמה (בעטיפה של withAudit)
}
```

**יתרונות:**
- תומך ב-combos מכוונים (למשל `grantFree + aiTier + subscriptionEndsAt` מ-`handleGrantFree`).
- לא שובר את ה-UI הקיים.
- הרשאה הגבוהה ביותר מנצחת — אם יש `{role: "ADMIN", grantFree: true}`, דורש ADMIN.
- `requireHighestPermission` (helper חדש) פשוט — עובר על הרשימה, מוצא את המדורגת גבוהה ביותר, וקורא ל-`requirePermission` עליה.

**🚨 דרישה קשיחה — אכיפה מספרית ב-handler (לא ב-permission!):**

ה-permission בודק **סוג פעולה**, לא **גודל**. לכן כל handler שמטפל ב-`extendDays` או `grantFree` חייב לאכוף את המגבלות המספריות **בעצמו** אחרי שה-permission עבר:

```ts
// אחרי requireHighestPermission
const { session } = auth;
const isAdmin = session.user.role === "ADMIN";

// MANAGER עם extendDays > 14 → 403
if (body.extendDays && body.extendDays > 14 && !isAdmin) {
  return NextResponse.json(
    { message: "מזכיר יכול להאריך ניסיון עד 14 יום בלבד" },
    { status: 403 }
  );
}

// MANAGER עם grantFree ו-subscriptionEndsAt > 30d → 403
if (body.grantFree) {
  const days = body.subscriptionEndsAt
    ? Math.ceil((new Date(body.subscriptionEndsAt).getTime() - Date.now()) / 86400000)
    : Infinity;
  if (days > 30 && !isAdmin) {
    return NextResponse.json(
      { message: "מזכיר יכול להעניק חינם עד 30 יום בלבד" },
      { status: 403 }
    );
  }
}

// 🚨 Back-door closure: MANAGER עם subscriptionEndsAt ישיר (בלי grantFree) → 3 תרחישים
// מונע מעקף של מגבלת extendDays (14d) ו-מגבלת grantFree (30d) ע"י שליחת subscriptionEndsAt ידני
if (body.subscriptionEndsAt !== undefined && !body.grantFree) {
  // תרחיש 1: MANAGER שולח null → הסרת תאריך תפוגה = מנוי unlimited בפועל
  if (body.subscriptionEndsAt === null && !isAdmin) {
    return NextResponse.json(
      { message: "מזכיר לא יכול להסיר תאריך תפוגה (יוצר מנוי ללא תפוגה)" },
      { status: 403 }
    );
  }

  // תרחיש 2: MANAGER שולח תאריך רחוק (> 30 יום)
  const days = Math.ceil(
    (new Date(body.subscriptionEndsAt).getTime() - Date.now()) / 86400000
  );
  if (days > 30 && !isAdmin) {
    return NextResponse.json(
      { message: "מזכיר יכול להאריך מנוי עד 30 יום קדימה בלבד" },
      { status: 403 }
    );
  }

  // תרחיש 3 (בונוס): MANAGER שולח תאריך בעבר → לא חוסמים, אבל logger.warn לרישום חשוד
  if (days < -1) {
    logger.warn("[Admin PATCH] subscriptionEndsAt set to past date", { userId, days });
  }
}
```

**למה ה-back-door closure חיוני:** בלי הבדיקה הזו, MANAGER יכול לעקוף את מגבלת `extendDays: 14` ב-3 דרכים:
1. `curl -X PATCH -d '{"subscriptionEndsAt": "2027-01-01"}'` — הארכה ישירה ללא הגבלה.
2. `curl -X PATCH -d '{"grantFree": false, "subscriptionEndsAt": "2027-01-01"}'` — כנ"ל.
3. `curl -X PATCH -d '{"subscriptionEndsAt": null}'` — **הסרת תאריך תפוגה = unlimited**. זהה ל-`grantFree` ללא הגבלה, רק בלי דגל.

שלושת המסלולים חייבים להיחסם. ה-permission check לבד (`users.change_tier`) לא מספיק — חייבים אכיפה מספרית ב-handler.

**חשוב:** `requireHighestPermission` יחזיר **הצלחה** ל-MANAGER גם עם `extendDays: 20` (כי `users.extend_trial_14d` זה ה-permission). רק ה-handler יודע לזרוק 403 על המגבלה המספרית. זה by design — כדי לא להמציא 3 permissions שונים לכל מספר שונה.

### 2. `GET /api/admin/audit-log` — סינון לפי הרשאה

```ts
const auth = await requirePermission("audit.view_per_user");
if ("error" in auth) return auth.error;

const isAdmin = auth.session.user.role === "ADMIN";

// MANAGER רק עם targetId ספציפי; ADMIN יכול לראות הכל
if (!isAdmin && !request.nextUrl.searchParams.get("targetId")) {
  return NextResponse.json(
    { error: "MANAGER חייב לספק targetId" },
    { status: 400 }
  );
}
```

### 3. `reset-password` — נשאר מחוץ למערכת ההרשאות

הקובץ משתמש ב-`x-admin-key` header עם `ADMIN_SECRET` ב-env. **לא** עובר דרך session. נשאר כ-`ADMIN_ONLY` אבל דרך מנגנון נפרד. ה-middleware הנוכחי מחריג אותו (`!pathname.includes("/reset-password")`). משאירים.

### 4. `backfill-user-numbers` — מאובטח נכון (נבדק)

**נבדק בקוד בפועל ([src/app/api/admin/backfill-user-numbers/route.ts:10-18](src/app/api/admin/backfill-user-numbers/route.ts#L10-L18)):**

1. מקבל `Bearer CRON_SECRET` ב-header (`Authorization`) לריצת cron.
2. אם ה-header חסר/לא נכון → נופל ל-`requireAdmin()` ומחזיר `auth.error` אם לא ADMIN.

**מאובטח.** _הערה: יש dead code — המשתנים `userId`/`session` מוגדרים בתוך ה-if block ולא נגישים מחוץ. לא משפיע על אבטחה, אבל שווה ניקוי._

### 5. פער נוסף בקוד הקיים — `audit-log` ללא סינון

`GET /api/admin/audit-log` כיום מחזיר את כל הלוג ל-`requireAdmin()`. ברגע ש-MANAGER יקבל גישה — הוא יראה את **כל** הפעולות של כל המנהלים. חובה להוסיף סינון `targetId` בשלב 1.

### 6. Rate limiting — מופיע בתוכנית, לא במטריצה (מכוון)

Rate limiting (20/60/5 לדקה לפי שכבה) הוא שלב 1.11 בתוכנית הכוללת. לא מופיע כאן כי זו ביקורת אבטחת **הרשאות**, לא ביקורת עומס. הבהרה למי שקרא את שני המסמכים.

### 7. 🚨 `PUT /api/admin/users/[id]` — פגיעות privilege escalation (חדשה, לא הייתה בגרסה 1)

הקוד בפועל ב-[src/app/api/admin/users/[id]/route.ts:95-119](src/app/api/admin/users/[id]/route.ts#L95-L119):

```ts
const { name, email, password, phone, role, aiTier } = body;
const updateData: Record<string, unknown> = { name, email, phone, role };
if (aiTier !== undefined) updateData.aiTier = aiTier;
```

**בעיה:** PUT מקבל `role` ו-`aiTier` ללא בדיקה. ברגע שנאפשר MANAGER ב-middleware — **מזכיר יוכל לשלוח `PUT {role: "ADMIN"}` ולשדרג את עצמו**. פגיעות זהה ל-PATCH.

**החלטה לשלב 1.5 (אופציה ב'):**

**להפשיט PUT לשדות בסיסיים בלבד** — `name`, `email`, `phone`, `password`. `role` ו-`aiTier` יוסרו לחלוטין מה-body של PUT. כל עדכון של `role`/`aiTier`/מנוי חייב לעבור דרך PATCH (שם יש את ה-collect+max pattern). PUT ידרוש `users.update_basic` (MANAGER OK).

**נימוק:**
- פחות risk surface — פחות שדות לבדוק בכל בקשה.
- פחות קוד מורכב — PUT הופך להיות פשוט ומוגדר.
- PATCH ממילא מטפל בכל ה-logic המורכבת; PUT הוא עדכון בסיסי בלבד.
- מונע מפתח עתידי שיחשוב לטעות ולקבל `role` ב-PUT.

**משימה בשלב 1.5:** להסיר `role` ו-`aiTier` מה-destructuring של PUT + להסיר מה-updateData. להסיר מה-API contract אם מסוכמני.

### 8. `grantFree` — `subscriptionEndsAt` הוא מנגנון ה-duration הקיים (תוקן בגרסה 3)

גרסה 2 טענה שאין תמיכה ב-duration. **זה לא נכון.** הקוד האמיתי:

**UI ב-[src/app/admin/billing/page.tsx:238-249](src/app/admin/billing/page.tsx#L238-L249):**
```ts
const days = parseInt(freeDuration);
const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

await fetch(`/api/admin/users/${userId}`, {
  method: "PATCH",
  body: JSON.stringify({
    aiTier: freeTier,
    grantFree: true,
    freeNote: freeNote || undefined,
    subscriptionEndsAt: endDate.toISOString(),  // ← duration שולח כ-date!
  }),
});
```

**Server ב-[src/app/api/admin/users/[id]/route.ts:237-239](src/app/api/admin/users/[id]/route.ts#L237-L239):**
```ts
if (subscriptionEndsAt !== undefined) {
  updateData.subscriptionEndsAt = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
}
```

**משמעות:** `grantFree` עם duration **כבר עובד**, רק לא נאכף מבחינת הרשאה. הפתרון:

**בשלב 1.5 — אכיפה ב-permission check:**
```ts
if (body.grantFree) {
  const days = body.subscriptionEndsAt
    ? Math.ceil((new Date(body.subscriptionEndsAt).getTime() - Date.now()) / 86400000)
    : Infinity;  // אין תאריך = unlimited
  required.push(days > 30 ? "users.grant_free_unlimited" : "users.grant_free_30d");
}
```

- MANAGER יוכל `grantFree` עם `subscriptionEndsAt ≤ 30 יום` (שורה 36).
- MANAGER לא יוכל `grantFree` ללא `subscriptionEndsAt` (נספר כ-unlimited).
- ADMIN בלבד יוכל `grantFree` עם >30 יום או unlimited (שורה 46).

### 8א. 🚨 `trials PATCH grantFree` — חריג שדורש תוספת קוד

ה-endpoint [src/app/api/admin/trials/route.ts:131-148](src/app/api/admin/trials/route.ts#L131-L148) מטפל ב-`action: "grantFree"`:

```ts
case "grantFree": {
  const tier = aiTier || "PRO";
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: "ACTIVE",
      aiTier: tier,
      isFreeSubscription: true,
      freeSubscriptionNote: note || `הועבר מניסיון למנוי חינם ע"י מנהל`,
      freeSubscriptionGrantedAt: new Date(),
    },
  });
  // ...
}
```

**ה-endpoint לא מקבל `subscriptionEndsAt` בכלל.** שלב 1 חייב:
1. להוסיף קבלת `subscriptionEndsAt` ב-case `grantFree` (code change קטן).
2. רק אז לאפשר MANAGER עם אכיפה של 30 יום.

**עד שזה נעשה** — שורה 40 במטריצה נשארת ADMIN-only.

### 8ב. שיפור אבטחתי עתידי (לא blocker)

מומלץ (לא חובה בשלב 1): השרת יחשב את `subscriptionEndsAt` לבד במקום לסמוך על הלקוח. API חדש יקבל `freeDays: number` והשרת יחשב `now + days × 24h`. מונע "זיוף" תאריך ע"י MANAGER זדוני ששולח PATCH ידני.

### 8ג. הערה על `revokeFree` — permission נפרד

גרסה 2 מיפתה `revokeFree` ל-`users.grant_free_30d` (permission של הענקה). לא נכון סמנטית. בגרסה 3 יש permission נפרד: **`users.revoke_free`** — ביטול מנוי חינם. זו פעולה מנהלתית פשוטה ששייכת ל-MANAGER.

### 9. תאימות חוזים — `requirePermission()` חייב להחזיר אותו shape כמו `requireAdmin()`

הקוד הנוכחי מחזיר `{ userId, session }` ו-30+ קבצי route מסתמכים על זה:

```ts
const auth = await requireAdmin();
if ("error" in auth) return auth.error;
const { userId, session } = auth;
```

**דרישה קשיחה:** `requirePermission(key)` חייב להחזיר `{ userId: string, session: Session }` בדיוק. אחרת כל המעבר ב-שלב 1.5 יגרום ל-30+ compile errors.

### 10. `set-admin` ו-`PATCH role` — שני אופנים לאותה פעולה

`POST /api/admin/set-admin` (שורה 58) ו-`PATCH /api/admin/users/[id]` עם `role` בגוף (שורה 45) — שניהם משדרגים תפקיד. סיכון: להגן על אחד ולשכוח את השני. **המלצה:** לאחד ל-endpoint אחד, או לסמן את `set-admin` כ-legacy ולהפנות ל-PATCH בשלב 6 (settings).

### 11. Snapshot ב-audit — תלות לא מצוינת

המטריצה מתייחסת ל-audit log עם `adminEmail`/`adminName` snapshot, אבל `src/lib/audit.ts` הנוכחי **אינו כולל שדות אלה**. זה תלות של שלב 1.5 על שלב 1.7 (מיגרציית Prisma) + שלב 1.6 (`withAudit`). הסדר חייב להיות: 1.7 → 1.6 → 1.5.

### 12. 🚨 `users.reset_password` — אסור על ADMIN (מונע privilege escalation)

MANAGER עם `users.reset_password` יוכל תיאורטית **לאפס סיסמה של ADMIN** ואז להתחבר כ-ADMIN. זה privilege escalation קלאסי.

**אכיפה בשלב 1.5:** הפונקציה שמטפלת ב-reset-password (הן ב-`PUT /users/[id]` עם `password`, הן ב-endpoint נפרד אם יש) **חייבת לבדוק שהמשתמש-היעד אינו ADMIN**:

```ts
async function canResetPassword(actorSession: Session, targetUserId: string) {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { role: true },
  });
  if (!target) return { error: "NOT_FOUND" };

  // ADMIN יכול לאפס כל אחד (כולל ADMIN אחר)
  if (actorSession.user.role === "ADMIN") return { ok: true };

  // MANAGER לא יכול לאפס ADMIN — privilege escalation
  if (target.role === "ADMIN") {
    return { error: "MANAGER_CANNOT_RESET_ADMIN" };
  }
  return { ok: true };
}
```

**אותה לוגיקה חלה על:**
- `PUT /users/[id]` עם `password` בגוף.
- כל endpoint עתידי של reset password.
- `POST /api/admin/reset-password` (כיום עם secret key — לא דרך session, אז לא רלוונטי).

### 13. `requireHighestPermission` + `PERMISSION_RANK` — חתימה

כדי שדוגמת הקוד ב-הבהרה 1 תעבוד, נדרש helper חדש ו-rank mapping:

```ts
// src/lib/permissions.ts
const PERMISSION_RANK: Record<Permission, number> = {
  // קריאה בסיסית (0-1)
  "users.view": 0,
  "audit.view_per_user": 0,
  "users.update_basic": 1,

  // פעולות MANAGER רגילות (2-4)
  "users.block": 2,
  "users.reset_password": 2,
  "users.create": 2,
  "users.change_tier": 3,
  "users.grant_free_30d": 3,
  "users.revoke_free": 3,
  "users.extend_trial_14d": 3,
  "packages.grant_manual": 3,
  "packages.revert": 3,
  "payments.manual": 3,
  "support.respond": 2,
  "settings.announcements": 3,

  // ADMIN בלבד (10+)
  "audit.view_all": 10,
  "users.grant_free_unlimited": 10,
  "users.change_role": 10,
  "users.delete": 10,
  "packages.catalog_manage": 10,
  "payments.refund": 10,
  "settings.billing_provider": 10,
  "settings.pricing": 10,
  "settings.feature_flags": 10,
  "settings.terms": 10,
  "idempotency.clear": 10,
};

export async function requireHighestPermission(
  keys: Permission[]
): Promise<{ error: NextResponse } | { userId: string; session: Session }> {
  if (keys.length === 0) {
    return { error: NextResponse.json({ message: "אין הרשאה נדרשת" }, { status: 500 }) };
  }
  const highest = keys.reduce(
    (max, k) => (PERMISSION_RANK[k] > PERMISSION_RANK[max] ? k : max),
    keys[0]
  );
  return requirePermission(highest);
}
```

**שימוש:**
```ts
const required: Permission[] = [/* ... */];
const auth = await requireHighestPermission(required);
if ("error" in auth) return auth.error;
const { userId, session } = auth;
```

**יתרון:** אם בקשה דורשת `{users.change_tier, users.change_role}` — requireHighestPermission יחזיר `requirePermission("users.change_role")` — הרשאה גבוהה יותר תמיד מנצחת.

---

## שאלות פתוחות לסבב ד'

1. **`payments.refund`** — האם זה דורש ADMIN_2FA נוסף? (למשל אישור SMS לפני refund). כרגע מוגדר ADMIN בלבד, בלי אישור נוסף.
2. **`users.delete`** — האם למחוק = soft-delete או מחיקה פיזית? אם soft — צריך שדה `deletedAt` בסכמה. אם פיזי — FK cascade ב-15+ מודלים (פגישות, תשלומים, שאלונים). חייב החלטה לפני שלב 1.
3. **`backfill-user-numbers`** — איך הוא מאובטח כיום? (פגיעות אפשרית).
4. **`audit.view_per_user` עם targetId חובה** — האם MANAGER יכול לראות audit של עצמו (לראות "מה עשיתי היום")? הגיוני לאשר. ההצעה: `targetId === session.user.id` תמיד מותר.
5. **`coupons GET` כ-ADMIN only** — מגביל את המזכיר מלראות אילו קופונים פעילים. אולי לפתוח ל-MANAGER כקריאה?
6. **MANAGER יוצר `alerts` — מה `type` מותר?** — לא כל סוגי ההתראות צריכים להיות זמינים (למשל `PAYMENT_FAILED` שמחולל ע"י מערכת). אולי להגביל ל-`MANUAL_REMINDER` בלבד?

---

## שלב הבא

לאחר אישור המטריצה:
1. כתיבת `src/lib/permissions.ts` לפי `PERMISSIONS_BY_ROLE`.
2. החלפת `requireAdmin` ב-`requirePermission(key)` ב-30 קבצי route (שלב 1.5 בתוכנית).
3. עדכון `src/middleware.ts` עם `ADMIN_ONLY_PATHS`.
4. טסטי RBAC: לכל endpoint — USER ⇒ 403, MANAGER ⇒ לפי המטריצה, ADMIN ⇒ 200.

---

**סיום טיוטה. ממתין לביקורת סבב ד'.**
