# העברת שיחה — שיפור ממשק הניהול של MyTipul

**תאריך עדכון אחרון:** 21.4.2026
**הוכן על ידי:** Claude Opus 4.7 (1M context)
**מטרה:** להעביר את ההקשר לשיחה חדשה כדי שתוכל להמשיך מאותה נקודה.

> **הערה:** יש כבר קובץ `CONSULTATION-HANDOFF.md` בפרויקט, שעוסק בפיצ'ר "פגישת ייעוץ" — לא קשור למשימה הזו. המסמך הנוכחי הוא **העברה נפרדת לגמרי** של שיפור ממשק הניהול.

---

## ⚡ סטטוס נכון לתאריך העדכון (21.4.2026)

**8 סבבי תכנון + ביקורת הושלמו** (v1 → v9.2 + שלב 0). התיעוד המלא ב-`C:/Users/User/Downloads/` (תוכניות, פאטצ'ים, מאסטר סופי).

**החלה הטמעה בפועל של Stage 1 (תשתית) — נעשה 6 commits על main (לא נדחפו):**

| Commit | תוכן | מצב |
|---|---|---|
| `4523346` | שלב 1.0 — timezone fixes (20 מיקומים) | ✅ |
| `f08d888` | שלב 1.1-1.2 — permissions.ts + api-auth | ✅ |
| `5ad98b8` | שלב 1.3-1.6 — middleware + PATCH + withAudit | ✅ |
| `94de82f` | שלב 1.6.1 — 4 תיקונים קריטיים מ-5 סוכנים | ✅ |
| `f5a440f` | שלב 1.8 — Rate limiting 3 שכבות + UX fix | ✅ |
| `8b23c17` | שלב 1.8.1 — middleware `runtime = "nodejs"` | ✅ |

**מצב קוד:** 162/162 טסטים עוברים. `tsc --noEmit` נקי. `npm run build` עובר.

### מה חסר / תלוי במשתמש:

1. **שלב 1.7 (Prisma schema)** — הקובץ `prisma/schema.prisma` ערוך ב-working tree (לא committed). 5 מודלים חדשים + שדות על קיימים + 3 ערכי enum חדשים. **לא הוחל על DB** כי כלל `pg_dump` ב-CLAUDE.md חסם — המשתמש צריך לבצע גיבוי ב-Render dashboard ולאחר מכן `npx prisma db push` או `migrate dev`.

2. **שלבים שתלויים ב-1.7 migration:**
   - 1.11 (`withIdempotency` wrapper — משתמש ב-`IdempotencyKey`)
   - 1.14 (`consumeSms` / `consumeAiAnalysis` — משתמשים ב-`UserPackagePurchase`)
   - 1.15 (Observability — משתמש ב-3 ערכי enum חדשים של `AdminAlertType`)
   - 1.16 (3 טסטי concurrency — דורשים Docker Postgres + המודלים החדשים)

3. **חבילת ביקורת נשלחה ל-Cursor** (21.4.2026). ממתינים לתגובה:
   - הקובץ: `C:/Users/User/Downloads/חבילת ביקורת לסוקר - שלבים 1.0-1.8 שבוצעו.md`

### החלטות טכניות שסוכמו לאורך הסבבים:

- **25 permissions** (closed type + `PERMISSION_RANK`) עם `requireHighestPermission` ל-combos.
- **Actor model** ב-audit (`{ kind: "user" | "system" }`).
- **Concurrency**: `SELECT FOR UPDATE` + `Serializable` + retry על 40001/40P01 + jitter 25%.
- **חבילות = בנק ללא תפוגה** (FIFO, consumed after monthly quota).
- **`withAudit` retry רק בחיצוני** (`consume*` עם `tx?` אופציונלי — אם בתוך tx קיים, לא retry).
- **Schema strategy:** "הרחבה במקום החלפה" ב-`SupportTicket` (שומרים `message`, `adminNotes`, `SupportResponse`, `resolvedAt/By`; מוסיפים בצד `SupportTicketNote`).
- **5 סוכני ביקורת** לפני push (עודכן מ-3 ל-5 ב-`feedback_pre_push.md`).
- **Permission `users.reset_password` אסור על target=ADMIN** (privilege escalation).
- **Email change guard** — MANAGER אסור לשנות email של ADMIN (back-door של password reset).
- **middleware `runtime = "nodejs"`** — חובה כדי שה-Map in-memory של rate-limit יעבוד.
- **`force-dynamic` + `Number(decimal) || 0`** — מוסכמות הפרויקט.

### שאלות פתוחות עד חזרת הסוקר:

1. האם `/api/admin/coupons` ו-`/api/admin/billing` צריכים להיות ב-`ADMIN_ONLY_PATHS`?
2. האם `/api/admin/billing/[id]` DELETE sensitive (5/min) או write (20/min)?
3. Schema: האם `SupportTicket.user` עם `@relation("ticketUser")` חדש יעבור migration נקי?
4. `withAudit` עם `actor.kind === "system"` — כרגע מתעד ב-logger בלבד (כי `adminId` היה non-null במקור). אחרי migration → יכתוב ל-DB עם `adminId = null`.

---

## מי אני (המשתמש)

- **מטפל חרדי** (תרפיסט) שבנה מערכת ניהול קליניקה עם עזרת AI.
- **לא מתכנת** — צריך הסברים פשוטים בעברית.
- עובד עם **Claude Code + Cursor Opus 4.6** במקביל — Claude כותב, Cursor מבקר.
- לא רוצה שישברו דברים. מעדיף בדיקה יסודית לפני כל שינוי.

## המערכת

**MyTipul** — מערכת ניהול קליניקה לקהל חרדי. T3 Stack:
- Next.js 14 App Router + TypeScript + Prisma + PostgreSQL + Tailwind + Shadcn.
- Hosting: **Render** (שרת UTC).
- Auth: NextAuth עם 3 תפקידים בסכמה: `USER` / `MANAGER` / `ADMIN`.
- SMS: פולסים. Payments: **קארדקום** (במשא ומתן, עדיין לא מחובר).
- מחירים: ESSENTIAL 117₪ / PRO 145₪ / ENTERPRISE 220₪ ב-`src/lib/pricing.ts`.

**חשוב:** האתר לקהל חרדי — **לא זוגיות**. חסימת שבת קריטית הלכתית ב-`src/lib/shabbat.ts`.

## המשימה שאנחנו עובדים עליה

### המטרה
לשפר את ממשק הניהול (`/admin/*`) כדי שיהיה:
- פשוט לשימוש — מזכיר יוכל לעבוד בלי ללמוד מערכת מורכבת.
- הכל במקום אחד — לא לקפוץ בין דפים.
- אמין — כל פעולה מתועדת (audit log).
- מוכן לסליקה אוטומטית (קארדקום) כשתתחבר.
- תומך במספר מזכירים במקביל.

### היקף — חשוב!
התוכנית נוגעת **אך ורק** בממשק הניהול (`/admin/*`).
**לא נוגעים ב:** שליחת SMS, יומן, פגישות, לקוחות, תשלומי לקוחות, קבלות, מסמכים, שאלונים, ניתוחי AI, דפי עבודה, `/dashboard/*` של המטפל. השלד הטיפולי לא זז.

### מאיפה התחלנו
- יש כבר **16 דפי admin קיימים** עם 31 קבצי API routes.
- Role-Based Access Control בסכמה — אבל רק `ADMIN` מוגן ב-middleware. `MANAGER` לא מופעל.
- `logAdminAction()` קיימת ב-`src/lib/audit.ts` — **אף אחד לא קורא לה בקוד!**
- יש באגים אמיתיים: race condition ב-`extendDays`, חישובי חודש ב-UTC, אין idempotency ל-webhooks.

## 7 סבבים של תכנון מול סוקר חיצוני

עברנו **7 גרסאות** של מסמך תכנון. כל אחת נבחנה ע"י Cursor Opus 4.6. הקבצים בתיקיית `C:\Users\User\Downloads\`:

1. `שינוי בתוכנת ניהול.md` — גרסה 1 (רעיון ראשוני).
2. `שינוי בתוכנת ניהול - גרסה 2.md` — אחרי ביקורת ראשונה.
3. `שינוי בתוכנת ניהול - גרסה 3.md` — הסוקר הכניס `Permission type`, `Serializable`, `IdempotencyKey`.
4. `שינוי בתוכנת ניהול - גרסה 4.md` — שלי: retry על 40P01, `consumeCredits` גנרי.
5. `שינוי בתוכנת ניהול - גרסה 5.md` — הסוקר תפס באג! `consumeCredits` הגנרי היה **קורס** בפרודקשן (הנחה שגויה על `aiMonthlyQuota` ב-`CommunicationSetting`). פיצל ל-2 פונקציות.
6. `שינוי בתוכנת ניהול - גרסה 6.md` — שלי: `withAudit` עם snapshot אוטומטי, cron race guard.
7. **`שינוי בתוכנת ניהול - גרסה 7.md`** — הגרסה הסופית. הסוקר תפס עוד בעיה: **nested transactions** (`withAudit` + `consumeSms` = תקלה).

### החלטת סבב ג'-וחצי (סופית)
הסוקר אישר את הפתרון שלי: **`consume*` יקבלו `tx?: Prisma.TransactionClient` אופציונלי**. אם ה-caller כבר בתוך transaction — מבצעות ישירות בלי retry. `withAudit` הוא ה-outermost wrapper שעושה retry + `Serializable` default.

### מה שסגור טכנית
- **מודל הרשאות:** `Permission` type סגור, `PERMISSIONS_BY_ROLE`, `requirePermission(key)`.
- **Actor model:** `{ kind: "user", session } | { kind: "system", source, externalRef }` — תומך ב-webhooks/cron/scripts.
- **Concurrency:** `SELECT FOR UPDATE` + `Serializable` + retry על 40001+40P01 + jitter 25%.
- **IdempotencyKey** table עם TTL 24 שעות + cron ניקוי.
- **חבילות = בנק ללא תפוגה.** 3 שכבות (מכסה חודשית → בנק FIFO) עם `Package` + `UserPackagePurchase` + `revert` לא-הרסני.
- **cron איפוס SMS:** `UPDATE` אטומי עם WHERE (idempotent, race-safe).
- **Audit log:** snapshot `adminEmail`/`adminName` בכל רישום, `onDelete: SetNull`.
- **Rate limiting:** 3 שכבות (20/60/5 לדקה) + per-target לרגישים.
- **Observability:** `AdminAlert` על retry failures + idempotency replay of failure.

### חלוקת הרשאות שסוכמה

**ADMIN (בעל המערכת = המטפל)** — הכל:
- הגדרות קארדקום, מחירים, feature flags, tier-limits.
- מחיקת משתמש, שינוי תפקיד, refund, חינם בלתי מוגבל.

**MANAGER (מזכיר)** — תפעול יומיומי:
- צפייה, חסימה/שחרור, הארכת ניסיון (עד 14 יום), חינם (עד 30 יום).
- סימון תשלום ידני, הוספת חבילת SMS/AI, תמיכה, איפוס סיסמה.
- **לא** יכול: מחירים, feature flags, מחיקה, refund, שינוי תפקידים.

## שלב 0 הסתיים — המצב כרגע

### 2 מסמכים חדשים בפרויקט

1. **[docs/permission-matrix.md](docs/permission-matrix.md)** (16 KB)
   - מטריצה של כל 60 endpoints (31 קבצים × methods) × 3 תפקידים.
   - הרשאות מפורשות, הבהרות קריטיות, פערים בקוד הקיים.
   - **פגיעויות שזוהו בקוד הקיים:**
     - `PATCH /api/admin/users/[id]` — אין permission split לפי body field (חובה לפני שמפעילים MANAGER).
     - `GET /api/admin/audit-log` — אין סינון `targetId` ל-MANAGER.
     - `backfill-user-numbers` — מאובטח ✓ (dead code קטן, לא קריטי).

2. **[docs/timezone-audit.md](docs/timezone-audit.md)** (12 KB)
   - 11 מקומות בקוד הקיים שמניחים UTC:
     - 🔴 CRITICAL: `usage-limits.ts:113-114,166-167`, `sms.ts:109`, `subscription-reminders:543`.
     - 🟠 HIGH: 6 מקומות ב-`export-utils.ts`, `receipt-service.ts:41`, `monthly-total/route.ts`.
   - דוגמאות חיוביות לחיקוי: `shabbat.ts`, `scheduler.ts:99-107` (`getIsraelHour`).
   - **הממצא הכי חשוב:** אין `engines.node` ב-`package.json` — חובה להוסיף (ICU).
   - **שדה `smsQuotaResetDate` קיים** ב-`CommunicationSetting:915`.
   - הצעה: 5 פונקציות חדשות ב-`date-utils.ts` + החלפה של 11 המקומות.

### המסמכים גם ב-Downloads
- `c:/Users/User/Downloads/permission-matrix.md`
- `c:/Users/User/Downloads/timezone-audit.md`

## מה הלאה

**המשתמש ממתין להחלטה על שלב 0.** 3 אפשרויות:
- A) הוא מעביר את שני המסמכים לסוקר Cursor לסבב ד'.
- B) הוא קורא את המסמכים בעצמו ומאשר.
- C) Claude מסכם את 2 המסמכים למסמך אחד קצר לסוקר.

**לאחר אישור שלב 0 — נתחיל שלב 1:**

### סדר שלב 1 המתוכנן (אל תתחיל בלי אישור!)

**שלב 1.0 — תשתית timezone (חובה לפני הכל):**
- הוספת 5 פונקציות ל-`src/lib/date-utils.ts` (`getIsraelMonth`, `getIsraelYear`, `isSameIsraelMonth`, `isNewIsraelMonthSince`, `getIsraelQuarter`).
- החלפה ב-11 המקומות שזוהו.
- הוספת `engines.node >= 20` ל-`package.json`.
- טסטי edge-cases (31/12 23:30 UTC, DST transition).

**שלב 1 — תשתית הרשאות:**
| # | פעולה | קובץ |
|---|---|---|
| 1.1 | `subscription-state.ts` — helper יחיד | חדש |
| 1.2 | `permissions.ts` + `import Role` | חדש |
| 1.3 | `requirePermission(key)` | `api-auth.ts` |
| 1.4 | עדכון middleware לפי המטריצה | `middleware.ts` |
| 1.5 | **מעבר ב-30 routes** (כולל permission split ב-`users/[id]`!) | 30 קבצים |
| 1.6 | `withAudit(actor, opts, fn)` — Actor model + snapshot | `audit.ts` |
| 1.7 | Prisma: `Package`, `UserPackagePurchase`, `WebhookEvent`, `IdempotencyKey`, `AdminAuditLog` snapshot, `AdminAlertType` חדש | schema |
| 1.8 | `method PaymentMethod?` ב-`SubscriptionPayment` | schema |
| 1.10 | תיקון race ב-`extendDays` | users/[id]/route.ts |
| 1.11 | Rate limiting 3 שכבות + per-target | middleware |
| 1.12 | `withIdempotency(key, fn)` + replay alert | חדש |
| 1.14 | `consumeSms` + `consumeAiAnalysis` עם `tx?` אופציונלי | `credits.ts` חדש |
| 1.16 | טסטי RBAC + 3 טסטי concurrency | vitest |
| 1.17 | cron איפוס SMS — `UPDATE` אטומי | cron |

**שלבים 2-7** — API חדש, UI כרטיס משתמש, דשבורד, billing פישוט, settings איחוד, קארדקום webhook.

## כללי עבודה חובה (חובה לקרוא!)

**הזיכרון הגלובלי ב:**
`C:\Users\User\.claude\projects\c--Users-User-Documents-tipul-AB-tipul-AB-main\memory\`

- **עברית בלבד** בתקשורת ובתוכניות. לא לערבב מילים באנגלית במשפט (שובר RTL).
- **הכל בעברית גם ב-UI** — סטטוסים, שגיאות, labels.
- **T3 Stack standards:** `export const dynamic = "force-dynamic"` בכל API route, `Number(value) || 0` ל-Prisma Decimal, `requireAuth()` ב-API, `logger` לא `console.log`.
- **לפני כל שינוי:** Explore agent + grep לכל הצרכנים + בדיקת UI/דיאלוגים.
- **אחרי כל שינוי:** `npx next build` + **3 סוכנים מקבילים** (תקינות / סנכרון / UX) + רק אז push.
- **לפני push — חובה 3 סוכנים. אם יש בעיה — לתקן ולשלוח שוב.**
- **עבודה ישירה על main** — לא feature branches.
- **commits קטנים בעברית** + `git add` לפי שם מפורש (לא `git add .`).
- **שינויים קריטיים (כסף/הלכה/זמנים) = TDD + ביקורת Cursor.** זה בדיוק מה שאנחנו עושים עכשיו.
- **גיבוי לפני שינוי גדול** — `pg_dump` לפני `prisma migrate deploy`.
- **לא לגעת בקבצים שלא ביקשו** — הצע ואל תבצע בלי אישור.
- **לא לבקש אישור לפקודות bash כל פעם** — המשתמש רוצה עבודה חלקה.

## מה הצ'אט החדש צריך לקרוא קודם

1. **[docs/permission-matrix.md](docs/permission-matrix.md)** — המטריצה המאושרת לשלב 0.
2. **[docs/timezone-audit.md](docs/timezone-audit.md)** — ביקורת TZ והפעולות לשלב 1.0.
3. **`C:/Users/User/Downloads/שינוי בתוכנת ניהול - גרסה 7.md`** — התוכנית הסופית המאושרת (7 סבבי ביקורת).
4. **קבצים מרכזיים בקוד:**
   - [prisma/schema.prisma](prisma/schema.prisma) — סכמת DB
   - [src/middleware.ts](src/middleware.ts) — RBAC נוכחי (רק ADMIN)
   - [src/lib/api-auth.ts](src/lib/api-auth.ts) — `requireAdmin()` היום
   - [src/lib/audit.ts](src/lib/audit.ts) — `logAdminAction` (לא נקראת!)
   - [src/lib/shabbat.ts](src/lib/shabbat.ts) — מודל לחיקוי ל-TZ נכון
   - [src/lib/sms.ts](src/lib/sms.ts) — SMS עם באג חודש UTC
   - [src/app/api/admin/users/[id]/route.ts](src/app/api/admin/users/[id]/route.ts) — race ב-extendDays + אין permission split
   - [src/lib/usage-limits.ts](src/lib/usage-limits.ts) — חישובי AI ב-UTC

## נושאים נוספים שעלו בצ'אט (לא קשורים ישירות)

- **קארדקום** — החברה שהמשתמש במשא ומתן איתה לסליקה. טרם חתום. שלב 7 בתוכנית מתכנן webhook + idempotency + HMAC.
- **פולסים** — ספק SMS קיים, עובד.

## פעולות אחרונות שבוצעו

בצ'אט הקודם:
1. כתיבת 2 המסמכים ב-`docs/`.
2. הרצת 3 סוכני ביקורת על 2 המסמכים.
3. תיקון המסמכים לפי הביקורת (עדכון על backfill-user-numbers, engines.node, monthly-total וכו').
4. העתקה ל-Downloads.

**הצעד הבא שנשאר:** לחכות להחלטת המשתמש — האם לשלוח לסוקר לסבב ד' או להתחיל שלב 1.0.

---

**סוף מסמך ההעברה.**

**לצ'אט החדש:**
1. קרא את המסמך הזה.
2. קרא את 2 המסמכים ב-`docs/`.
3. שאל את המשתמש: "ראיתי שסיימנו שלב 0 עם מטריצת הרשאות וביקורת timezone. מה הלאה — לשלוח לסוקר Cursor לסבב ד', או להתחיל שלב 1.0 (תיקוני timezone)?"
