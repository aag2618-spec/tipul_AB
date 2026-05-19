# 🔐 הנדאוף — סבב אבטחה 14

**תאריך:** 2026-05-19
**מסמך מקור:** `אבטחה קורסור בשילוב הכנה של כלוד.md` (Downloads)
**Commit בסיס:** `4c5efe7` (main, mytipul.com fix)
**גישה:** 3 גלים — 14a (Critical Infra) → 14b (High Auth) → 14c (Sessions + Encryption)

---

## 🚨 ההקשר: רוב הביקורת **כבר תוקנה**

קורסור ערך ביקורת מקיפה (~80 ממצאים) — **3 סוכני Explore** של Claude הצליבו מול ה-codebase ומצאו ש-~50% מהממצאים כבר תוקנו ב-סבבים 7-13 (commits 867ff48, dfecc30 ועוד). הסבב הזה (14) מתמקד **רק** במה שעדיין רלוונטי לאחר ההצלבה.

**Crons שכבר קיימים ב-render.yaml** (לידיעה, שלא להוסיף שוב):
session-reminders-24h, session-reminders-2h, subscription-reminders,
daily-summary-notifications, debt-reminders, admin-alerts-generator,
trial-expiry, impersonation-hardkill, booking-outbox, data-access-audit-retention,
audit-log-retention, recording-orphan-cleanup.

**Crons חסרים שצריך להוסיף (C4):**
1. `subscription-recurring-charge` — auto-renew של מנויים
2. `promote-pending-tiers` — שדרוג tier אחרי תקופה
3. `cardcom-cleanup-pending` — ניקוי PENDING transactions
4. `cardcom-invoice-sync` — Cardcom maintenance
5. `cardcom-pdf-backup` — Cardcom maintenance
6. `cardcom-pdf-rehash` — Cardcom maintenance
7. `cleanup-idempotency` — rate-limit cleanup
8. `departure-deadlines` — deadlines
9. `fix-stuck-payments` — תיקון תשלומים תקועים

---

## ☐ Checklist — 10 פריצות

### 🔴 14a — Critical Infra (3 commits)

- [x] **C2** — `render.yaml:8` + `package.json:12`: הוסרה `--accept-data-loss` מ-`prisma db push` (לא מהלך מלא ל-`migrate deploy` — חסר baseline)
  - **Why:** `db push --accept-data-loss` יכול למחוק עמודות של PHI בכל restart אם schema drift. drifting → data loss.
  - **קבצים:** `render.yaml` (שורה 8), `package.json` (שורה 12)
  - **Status:** `partial` — הסרת הדגל בלבד. מעבר מלא ל-`migrate deploy` ידרוש baseline ידני (`migrate resolve --applied`) ב-Render dashboard. → HANDOFF round 15.

- [x] **C3** — `SavedCardToken.token` plaintext → `ENCRYPTED_FIELDS`
  - **Why:** טוקני Cardcom שמורים plaintext ב-DB. ה-token מאפשר חיוב חוזר של הלקוח.
  - **קבצים:** `src/lib/encrypted-fields.ts:27-59` (הוסף `savedCardToken: ["token"]`)
  - **Note:** אין משתמשים בייצור עדיין → אין צורך ב-backfill
  - **Status:** `done`

- [x] **C4** — הוסף 9 crons חסרים ל-`render.yaml`
  - **Why:** crons מוגדרים בקוד אבל לא ב-Render → לא רצים בייצור → auto-renew/cleanup לא קורים.
  - **קבצים:** `render.yaml`
  - **Schedule adjustments (סוכן 3):** `subscription-recurring-charge` הוסט ל-06:15 UTC (היה התנגשות 06:00 עם debt-reminders/trial-expiry). `recording-orphan-cleanup` הוסט ל-01:30 UTC (היה התנגשות עם cleanup-idempotency).
  - **Status:** `done`

- [x] **H15** — Cardcom env vars חסרים ב-`render.yaml`
  - **Why:** משתנים חסרים → ייצור נופל ל-defaults לא מאובטחים או זורק error.
  - **משתנים נכונים (אחרי תיקון סוכן 2):** `CARDCOM_ADMIN_TERMINAL_NUMBER`, `CARDCOM_ADMIN_API_NAME`, `CARDCOM_ADMIN_API_PASSWORD`, `CARDCOM_ADMIN_WEBHOOK_SECRET`, `CARDCOM_SANDBOX_TERMINAL_NUMBER`, `CARDCOM_SANDBOX_API_NAME`, `CARDCOM_SANDBOX_API_PASSWORD`, `CARDCOM_WEBHOOK_IP_ALLOWLIST`, `CARDCOM_REQUIRE_WEBHOOK_TIMESTAMP`, `TRUSTED_PROXY_HOPS`, `RECORDING_URL_SECRET`
  - **שינוי קריטי:** בגרסה הראשונה כתבתי `CARDCOM_USERNAME/TERMINAL_NUMBER/API_KEY` — שלא תואמים לקוד. תוקן ל-`CARDCOM_ADMIN_*` כפי ש-`src/lib/cardcom/admin-config.ts:43-45` מצפה.
  - **קבצים:** `render.yaml`, `.env.example`
  - **Status:** `done`

### ⚠️ לא תוקן ב-14a (לא בלוקר, נשאר ל-round 15)

- **withAudit חסר ב-state-changing crons** — סוכן 3 ציין: `promote-pending-tiers`, `fix-stuck-payments`, `cardcom-invoice-sync`, `cardcom-pdf-rehash`. **Note:** `subscription-recurring-charge` ו-`cardcom-cleanup-pending` כן עוטפים withAudit פנימית (אומת). הבעיה היא pre-existing — הקוד היה כך לפני 14a; רק התראתי את ה-crons ל-render.yaml. תיקון ל-HANDOFF round 15.

### 🟠 14b — High Auth (commit אחד)

- [x] **H3** — Secretary reply ללא `canSendReminders` check
  - **Why:** מזכירה יכולה לשלוח reply לתשובת לקוח גם אם המטפל ביטל לה את הרשאת ההזכרות.
  - **קבצים:** `src/app/api/communications/reply/route.ts` (הוסף scope check אחרי requireAuth)
  - **Status:** `done`

- [x] **H8** — Registration enumeration
  - **Why:** הבדל בתשובה בין email קיים ל-email חדש → תוקף ימפה את ה-DB.
  - **תיקון:** UNIFORM_RESPONSE 201 גם בקיים, +250ms delay, הוסר `userId` מהתשובה, hash-short ב-logging.
  - **קבצים:** `src/app/api/auth/register/route.ts`
  - **Status:** `done`

- [x] **H9** — Booking GET ללא rate-limit
  - **תיקון:** `BOOKING_GET_RATE_LIMIT=30/min` per-IP.
  - **קבצים:** `src/lib/rate-limit.ts` (קבוע חדש), `src/app/api/booking/[slug]/route.ts` (חיבור)
  - **Status:** `done`

- [x] **H10** — `getClientIp` עוזב leftmost X-Forwarded-For
  - **תיקון:** חיבור helper `getClientIp` (rightmost) ב-**12 מקומות** (חוק 2 — חיווט מלא):
    - `src/lib/auth.ts` (login rate-limit)
    - `src/lib/audit-logger.ts` (forensics)
    - `src/lib/cron-auth.ts` (cron rate-limit)
    - `src/app/api/booking/[slug]/route.ts` (POST)
    - `src/app/api/auth/{2fa/verify,2fa/send,2fa/check-required,forgot-password,reset-password,verify-email,resend-verification,register}/route.ts`
    - `src/app/api/admin/reset-password/route.ts` (הוסר local שלקח leftmost)
  - **בונוס:** `cron-auth.ts` rate-limit key הועבר מ-`cron:${ip}` ל-`cron:${pathname}` — מונע חסימת כל ה-crons ב-XX:00 UTC (כל ה-crons משתפים את ה-IP של Render edge).
  - **Status:** `done` (יש שארית אחת ב-`impersonate/start:148` ב-audit logging — לא קריטי, → round 15)

### 🔴 14c — Sessions + Encryption

- [x] **H6** — `sessionVersion` לבטל sessions ישנים
  - **Why:** הפעלת 2FA / החלפת password / חסימת משתמש לא ביטלה JWTs קיימים. תוקף שגנב cookie היה ממשיך להיות מחובר.
  - **תיקון:** הוסף `User.sessionVersion Int @default(0)` + migration. `token.sv` נשמר בלוגין (גם Google OAuth). ה-`jwt callback` משווה `dbUser.sessionVersion > token.sv` → `sessionStale=true`. `api-auth.ts` + `middleware.ts` דוחים 401 + redirect ל-login.
  - **bump endpoints:**
    - `src/app/api/auth/2fa/totp-setup/route.ts` (POST + DELETE)
    - `src/app/api/auth/2fa/recovery-codes/route.ts` (regenerate)
    - `src/app/api/admin/users/[id]/disable-2fa/route.ts`
    - `src/app/api/admin/users/[id]/toggle-block/route.ts` (רק בחסימה)
  - **לא bumpים:** reset-password (passwordChangedAt + passwordStale כבר מטפלים), cron auto-block (false-positive friendly).
  - **קבצים:** `prisma/schema.prisma`, `prisma/migrations/20260519_add_user_session_version/migration.sql`, `src/lib/auth.ts`, `src/lib/api-auth.ts`, `src/middleware.ts`, 4 endpoints.
  - **Status:** `done`

- [x] **H13** — encryption של `QuestionnaireResponse` + `IntakeResponse`
  - **Why:** מידע קליני רגיש (תשובות שאלון, intake, ניתוח AI) נשמר plaintext.
  - **תיקון:**
    - `ENCRYPTED_FIELDS.questionnaireResponse = ["aiAnalysis"]` (String)
    - `ENCRYPTED_JSON_FIELDS.questionnaireResponse = ["answers"]` (Json)
    - `ENCRYPTED_JSON_FIELDS.intakeResponse = ["responses"]` (Json)
  - dual-read של `maybeDecryptJson` (line 167-186) מטפל ב-legacy plaintext אוטומטית.
  - אין WHERE contains על השדות האלה (אומת ב-grep).
  - **קבצים:** `src/lib/encrypted-fields.ts`
  - **Status:** `done`

---

## 🛡️ הוראות עבודה (חובה!)

לפני כל commit:
1. ✅ `Grep` רחב לכל ה-callers
2. ✅ סדר checks: auth → scope → consent → action
3. ✅ `logger` במקום `console`
4. ✅ עדכון test mocks אם השתנו `ENCRYPTED_FIELDS`/permission
5. ✅ `npx tsc --noEmit` נקי
6. ✅ `npx vitest run` — אם משהו חדש נכשל בגלל שינוי שלי → לתקן
7. ✅ `git add <files>` ספציפי — לא `git add .` (יש צ'אטים מקבילים פעילים)

לפני כל push:
8. ✅ 5 סוכנים מקבילים (3 סנכרון + 2 תקינות): auth/payments/AI+scope+cron + build+tests + quality
9. ✅ לולאה עד נקי — אין מקסימום סבבים
10. ✅ אישור explicit מהמשתמש לפני `git push`

שלבים קריטיים (14c):
11. ✅ TDD לפני implementation — לכתוב טסטים שנכשלים, ואז ירוקים
12. ✅ Cursor review של ה-plan לפני implementation (לפי `feedback_critical_changes_process.md`)
13. ✅ DB backup ב-Render Dashboard לפני migration של H6

---

## 📦 קבצים שיושפעו (סך הכל)

### 14a (5 קבצים)
- `render.yaml` (C2, C4, H15)
- `package.json` (C2)
- `.env.example` (H15)
- `src/lib/encrypted-fields.ts` (C3)

### 14b (4-5 קבצים)
- `src/app/api/communications/reply/route.ts` (H3)
- `src/app/api/auth/register/route.ts` (H8)
- `src/app/api/booking/[slug]/route.ts` (H9)
- `src/lib/auth.ts` (H9 + H10)
- `src/lib/rate-limit.ts` (H9 — קבוע חדש)

### 14c (5-7 קבצים)
- `prisma/schema.prisma` (H6)
- `prisma/migrations/<ts>_user_session_version/migration.sql` (H6)
- `src/lib/auth.ts` (H6 — jwt/session callbacks)
- `src/app/api/auth/2fa/enable/route.ts` (H6 — bump)
- `src/app/api/auth/2fa/disable/route.ts` (H6 — bump)
- `src/app/api/auth/change-password/route.ts` (H6 — bump)
- `src/lib/encrypted-fields.ts` (H13)
- tests חדשים עבור 2 הפריצות (TDD)

---

## 🚫 לא נכלל בסבב 14 (HANDOFF round 15)

- כל Medium (~35 ממצאים) — Group A-H מקורסור
- כל Low (~22 ממצאים)
- C1 — fix-receipts (שיפור קל; יש כבר auth+scope)
- C5 — JWT cache hardening (אופטימיזציה)
- שאר ההמלצות מקורסור שלא הגיעו ל-Critical/High

---

**Last updated:** 2026-05-19 (תחילת הסבב)
