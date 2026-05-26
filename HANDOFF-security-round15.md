# 🔐 הנדאוף לסבב אבטחה 15 (אחרי סיום סבב 14)

**תאריך:** 2026-05-19
**Commit אחרון ב-main:** `6659351` (סוף סבב 14)
**מסמך קודם:** `HANDOFF-security-round14.md` (כל מה שתוקן ב-14)
**מסמך מקור של הביקורת:** `אבטחה קורסור בשילוב הכנה של כלוד.md` (Downloads)

---

## 📊 התמונה הגדולה

קורסור ערך ביקורת אבטחה מקיפה (~80 ממצאים): 6 Critical, 17 High, ~35 Medium, ~22 Low.
3 סוכני Explore של Claude הצליבו עם ה-codebase ומצאו ש-~50% מהממצאים **כבר תוקנו** בסבבים קודמים (7-13).

**סבב 14 (הסתיים) — תיקן 10 פריצות:**
- 14a (`2404db6`): C2, C3, C4, H15 — Critical Infra
- 14b (`1c7c6f9`): H3, H8, H9, H10 — High Auth
- 14c (`6659351`): H6, H13 — Sessions + Encryption

**סבב 15 (הסבב הזה) — מטפל ב:**
1. ✅ פריצות שהתגלו תוך כדי סבב 14 ולא הספיקו (3 פריטים)
2. ✅ Critical/High שנדחו עם החלטה מודעת בסבב 14 (2 פריטים)
3. ✅ Medium (~35 ממצאים)
4. ✅ Low (~22 ממצאים)

---

## 🛑 חובה לקרוא לפני שמתחילים

לפני **כל** שורת קוד שאתה כותב, חייב לקרוא:
1. `C:\Users\User\.claude\projects\c--Users-User-Documents-tipul-AB-tipul-AB-main\memory\feedback_security_fixes.md` — **10 חוקי האבטחה**, חובה
2. `C:\Users\User\.claude\projects\c--Users-User-Documents-tipul-AB-tipul-AB-main\memory\feedback_coding_standards.md` — T3 stack, Prisma Decimal, force-dynamic, logger
3. `C:\Users\User\.claude\projects\c--Users-User-Documents-tipul-AB-tipul-AB-main\memory\feedback_parallel_chats.md` — לא `git add .`, ספציפי בלבד
4. `C:\Users\User\.claude\projects\c--Users-User-Documents-tipul-AB-tipul-AB-main\memory\feedback_pre_push.md` — 5 סוכנים לפני push
5. `C:\Users\User\.claude\projects\c--Users-User-Documents-tipul-AB-tipul-AB-main\memory\feedback_critical_changes_process.md` — TDD לשינויים קריטיים
6. `HANDOFF-security-round14.md` בשורש — מה תוקן וכיצד

**העבודה ישירות על main** (לא ענפים נפרדים — לפי `feedback_work_on_main`).

---

## 🔥 חלק 1 — פריצות שהתגלו בסבב 14 (לסבב 15)

### 1.1 — `withAudit` חסר ב-4 cron jobs ⚠️ עדיפות גבוהה

**הבעיה:** סוכן Audit מסבב 14 גילה ש-4 cron jobs שמשנים state (mutating) לא עוטפים את הפעולה ב-`withAudit`. ה-audit log חסר עבורם.

**הקבצים והפעולות שלא מבוקרות:**

1. `src/app/api/cron/promote-pending-tiers/route.ts`
   - משנה: `aiTier` (scope של AI ל-PHI), `pendingTier: null`
   - למה זה אבטחה: שינוי הרשאת AI על PHI — חייב audit לפי תקנות הגנת הפרטיות.

2. `src/app/api/cron/fix-stuck-payments/route.ts`
   - משנה: `Payment.status=PAID`, יוצר Task
   - למה זה אבטחה: שינוי סטטוס תשלום ללא audit = עיוורון לתרמיות.

3. `src/app/api/cron/cardcom-invoice-sync/route.ts`
   - משנה: יוצר `OrphanCardcomDocument` + `AdminAlert`
   - למה: orphan invoices = סוגיית compliance חשבונאית.

4. `src/app/api/cron/cardcom-pdf-rehash/route.ts`
   - משנה: יוצר `AdminAlert` URGENT (bit-rot של PDF)
   - למה: זיהוי tampering של מסמכים חשבונאיים.

**הפתרון (pattern קיים ב-`cleanup-idempotency/route.ts:32-40`):**
```ts
const count = await withAudit(
  { kind: "system", source: "CRON", externalRef: "<cron-name>" },
  {
    action: "cron_<descriptive_name>",
    targetType: "<entity>",
    details: { reason: "scheduled_run" },
  },
  async (tx) => { /* existing logic */ }
);
```

**אזהרה:** לכמה מה-crons יש פעולות פנימיות שכבר עוטפות `withAudit` (כמו `subscription-recurring-charge` שלא ב-רשימה כי `subscription-recurring.ts` כבר עושה את זה). לפני שאתה עוטף, בדוק ב-grep אם יש `withAudit` בקבצים שה-cron קורא להם — כדי לא ליצור כפילות.

---

### 1.2 — `impersonate/start:148` עוזב leftmost XFF ⚠️ עדיפות נמוכה

**הקובץ:** `src/app/api/clinic-admin/impersonate/start/route.ts:148`

**הקוד הנוכחי:**
```ts
const xff = request.headers.get("x-forwarded-for");
// משתמש ב-leftmost = ניתן לזיוף
```

**הפתרון:**
```ts
import { getClientIp } from "@/lib/get-client-ip";
// ...
const ip = getClientIp(request);
```

**למה לא תוקן בסבב 14:** משמש רק ל-audit logging (לא לרייט-לימיט), אז ה-impact מוגבל ל-IP מזויף ב-log. עדיין כדאי לתקן.

---

### 1.3 — `register/route.ts` double-import של `createHash` ⚠️ קוסמטי

**הקובץ:** `src/app/api/auth/register/route.ts`
- שורה 4: `import { randomBytes, createHash } from "node:crypto";` (הוסף ב-H8)
- שורה 136: `const { createHash } = await import("node:crypto");` (קוד קיים)

**הפתרון:** למחוק את ה-dynamic import בשורה 136 ולהשתמש ב-`createHash` שכבר מיובא.

---

## 🟠 חלק 2 — Critical/High שנדחו במודע בסבב 14

### 2.1 — C2 השלמת מעבר ל-`prisma migrate deploy` 🔴 קריטי לטווח ארוך

**מה תוקן ב-14a:** הוסרה הדגל `--accept-data-loss` מ-`prisma db push`. זה מנע אובדן נתונים אבל **לא** העביר לאסטרטגיה של migrations מסודרים.

**הקבצים הנוכחיים:**
- `render.yaml:12`: `startCommand: npx prisma db push && ...`
- `package.json:12`: `"start:prod": "prisma db push && ..."`

**הבעיה הנוכחית:** `db push` סוטה מ-schema → DB ללא היסטוריה. אם schema משתנה בצורה לא תואמת, יש חוסר תאימות בלי warning.

**הפתרון (מורכב, דורש פעולה ידנית):**

צעד 1 (קוד):
```yaml
# render.yaml
startCommand: npx prisma migrate deploy && (npx prisma db execute ... || true) && npm start
```

צעד 2 (ידני, Render Shell):
```bash
# רץ פעם אחת ב-Render shell של ה-DB:
# לסמן את כל ה-migrations הקיימים כ-"applied" (כי הם כבר במצב ה-DB)
for migration in $(ls prisma/migrations | grep -v migration_lock); do
  npx prisma migrate resolve --applied "$migration"
done
```

**איך לדעת שזה הצליח:**
```bash
npx prisma migrate status
# צריך להחזיר: "Database schema is up to date!"
```

**Why:** ה-DB ב-production נוצר ב-`db push` בלי migration_lock.toml ובלי טבלת `_prisma_migrations`. עד שלא ירוצו `migrate resolve` ל-baseline, `migrate deploy` ינסה להחיל מ-0 → catastrophic.

**⚠️ פעולה ידנית של המשתמש:**
1. גיבוי DB ב-Render Dashboard (Backups → Backup Now)
2. גישה ל-Render Shell של ה-DB
3. הרצת `migrate resolve` כפי שמתואר
4. רק אז דחיפת השינוי ב-`render.yaml`+`package.json`

---

### 2.2 — C1 fix-receipts הקשחת scope 🟡 שיפור

**הקובץ:** `src/app/api/admin/fix-receipts/route.ts`
**מה תוקן בעבר:** יש `requireAuth()` ב-שורה 11 (מסבב מוקדם)
**מה חסר:** `ADMIN check` + `loadScopeUser` (לפי `feedback_security_fixes.md` חוק 3)

**הפתרון:**
```ts
import { loadScopeUser, isAdmin } from "@/lib/scope";

const auth = await requireAuth();
if ("error" in auth) return auth.error;
const { userId } = auth;

const scopeUser = await loadScopeUser(userId);
if (!isAdmin(scopeUser)) {
  return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
}
```

**Why:** ה-route משחזר receipt tokens — פעולה רגישה שצריכה להיות מוגבלת ל-ADMIN בלבד.

---

### 2.3 — C5 JWT cache hardening 🟡 אופטימיזציה

**הקובץ:** `src/lib/auth.ts:17` (`JWT_CACHE_TTL = 30 * 1000`)

**הבעיה:** revocation של block/role עלולה לאחר עד 30 שניות בגלל cache.

**מצב נוכחי:**
- יש `invalidateJwtCache(userId)` שמנקה את ה-cache מיידית
- `feedback_security_fixes.md` חוק 2: כל route ששינוי role/isBlocked חייב לקרוא לזה
- ה-`passwordChangedAt` mechanism + H6 `sessionVersion` כבר מטפלים בשינויים קריטיים מיד

**הפתרון אם רוצים optimization נוסף:**
- הוספת `passwordChangedAt` check לפני שמטעמים cache (cache hit only if cache.passwordChangedAt === db.passwordChangedAt)
- או: הקטנת TTL ל-10 שניות

**Why לדחות:** ה-H6 (`sessionVersion`) + `passwordStale` כבר מספקים את ההגנה החשובה. ה-cache TTL הוא optimization.

---

## 🟡 חלק 3 — Medium (~35 ממצאים — Group A-H של קורסור)

**הערה:** הביקורת המקורית של קורסור (`אבטחה קורסור בשילוב הכנה של כלוד.md`) מקבצת את ה-Medium ל-8 קבוצות (A-H). חלקן אולי כבר תוקנו בסבבים קודמים — **לפני** שמתחילים, להריץ Explore עם Claude כדי להצליב מול ה-codebase ולסנן את מה שכבר תוקן (כפי שנעשה בסבב 14).

**הקבוצות (כפי שמופיעות במסמך המקורי של קורסור):**

### Group A — Input Validation
- Schemas של zod שעדיין חסרים על routes פחות-מרכזיים
- input length caps על שדות שעלולים להיות vector ל-DoS

### Group B — Information Disclosure
- הודעות שגיאה שמסגירות פרטי DB
- stack traces ב-production
- timing differences ב-flows רגישים

### Group C — Authorization & Access Control
- routes שחסרים scope check אחרי auth
- WHERE clauses ללא `buildClientWhere`
- access control על נתיבי `/admin/*` שלא נבדקו

### Group D — Session Management
- session fixation potentials
- cookie hardening (SameSite, Secure)
- absolute session timeout בנוסף ל-`maxAge`

### Group E — Cryptography & Secrets
- שדות PHI נוספים שצריכים להיות מוצפנים (אם יש)
- secret rotation procedures
- בדיקת חוזק של מפתחות

### Group F — Logging & Monitoring
- audit gaps נוספים (מעבר ל-4 ה-crons מ-1.1)
- PII בלוגים (סבב 7 כבר טיפל במרבית — לבדוק)
- alerting על אירועי אבטחה

### Group G — Dependencies & Build
- `npm audit` — חבילות עם CVEs
- pinning של גרסאות לחומרי build
- supply chain checks

### Group H — Infrastructure & Configuration
- CSP headers
- CORS configuration
- security headers (HSTS, X-Frame-Options, X-Content-Type-Options)

**שיטה מומלצת:**
1. קרא את `אבטחה קורסור בשילוב הכנה של כלוד.md` ב-Downloads
2. שלח 3 סוכני Explore לעבור על קבוצה A-H, להצליב עם ה-codebase, ולסנן ממצאים שכבר טופלו
3. החליטו אילו 5-10 הכי קריטיים והתחילו מהם
4. את השאר → HANDOFF round 16

---

## 🟢 חלק 4 — Low (~22 ממצאים)

ממצאים פחות קריטיים — observations, code quality, ערכה. רובם cosmetic או optimization. לפי המסמך המקורי:

- L1: JWT cache 30s window (ר' 2.3)
- L2: CRON_SECRET_PREVIOUS rotation alert
- L3: Booking slug enumeration (404 שונה בין "לא קיים" ל-"לא פעיל")
- L5: Filename RTL override
- L6: Audit log חסר ב-2FA verify
- ועוד 17 ממצאים — לקרוא במסמך המקורי של קורסור

**עדיפות:** אחרי שכל ה-Medium טופלו. כנראה לא בסבב 15.

---

## 📋 פעולות ידניות של המשתמש (aag2618)

**מה שכבר בוצע (לא לחזור על זה):**
- ✅ הוספת `CARDCOM_REQUIRE_WEBHOOK_TIMESTAMP=true` ו-`TRUSTED_PROXY_HOPS=1` ב-Render Dashboard

**מה נשאר לעשות בעתיד (כשיש Cardcom production):**
- ⏳ הוספת 9 env vars של Cardcom (פירוט ב-`memory/project_cardcom_env_vars_pending.md`)

**פעולות נדרשות אם תיגעו ב-C2 (חלק 2.1):**
1. גיבוי DB ב-Render Dashboard לפני שינוי
2. גישה ל-Render Shell וביצוע `prisma migrate resolve --applied` לכל migration
3. וידוא ש-`prisma migrate status` מחזיר "up to date"

**שום פעולה ידנית נוספת אינה נדרשת לסבבים 1.1-1.3, 2.2, 2.3, Group A-H Medium, או Low.**

---

## 🎯 סדר ביצוע מומלץ לסבב 15

**שלב 1 — תיקונים מהירים (~30 דק'):**
- 1.1: `withAudit` ב-4 crons (commit 1)
- 1.2: `impersonate/start` XFF (commit 2 — או יחד עם 1.1)
- 1.3: register double-import (אותו commit כמו 1.1)

**שלב 2 — Critical שנדחה (זהירות!):**
- 2.2: fix-receipts ADMIN check (קל, commit 1)
- 2.3: JWT cache hardening (אופציונלי — דחה לפעם הבאה)
- 2.1: prisma migrate deploy (**דורש פעולה ידנית של המשתמש** + גיבוי DB)

**שלב 3 — Medium (לוקח זמן):**
- הצלבה עם codebase (3 סוכני Explore)
- בחירת 5-10 הכי קריטיים
- תיקון בקבוצות של 3-4 לפי commit

**שלב 4 — Low:**
- HANDOFF round 16 אם הזמן לא מספיק

---

## 🛡️ כללי עבודה לסבב 15 (חובה!)

לפני כל **תיקון**:
1. ✅ קריאת `feedback_security_fixes.md` (10 חוקים)
2. ✅ `Grep` רחב לכל ה-callers של הקוד שאתה משנה
3. ✅ סדר checks ב-route: auth → scope → parseBody (zod) → findFirst (scope filter) → consent → action
4. ✅ `logger` במקום `console`
5. ✅ עדכון test mocks אם השתנו `ENCRYPTED_FIELDS`/permissions

לפני **כל commit**:
6. ✅ `npx tsc --noEmit` נקי
7. ✅ `npx vitest run` — מותר רק 3 כשלים pre-existing ב-`impersonation.test.ts`
8. ✅ `git add <files ספציפיים>` — **לא** `git add .`!
9. ✅ הודעת commit בפורמט `security(round15-XX): ...`

לפני **כל push**:
10. ✅ 5 סוכנים מקבילים: (1) auth/2FA/reset (2) payments/cardcom (3) AI+scope+cron+audit (4) build+tests (5) code quality
11. ✅ לולאה — מתקנים את מה שהם מצביעים, שולחים שוב, עד שכולם ✅
12. ✅ אישור explicit מהמשתמש לפני `git push`

---

## 📂 מבנה זיכרון רלוונטי

הזיכרון נמצא ב: `C:\Users\User\.claude\projects\c--Users-User-Documents-tipul-AB-tipul-AB-main\memory\`

**מסמכים שחייב לקרוא בתחילה:**
- `MEMORY.md` — index של הכל
- `user_role.md` — המשתמש הוא מטפל לא מתכנת
- `feedback_security_fixes.md` — 10 חוקי אבטחה
- `feedback_coding_standards.md` — T3, Prisma, Date null, force-dynamic
- `feedback_parallel_chats.md` — לא `git add .`
- `feedback_pre_push.md` — 5 סוכנים
- `feedback_critical_changes_process.md` — TDD לשינויים קריטיים
- `feedback_hebrew.md` — תקשורת בעברית
- `project_cardcom_env_vars_pending.md` — Cardcom env vars שהמשתמש יוסיף בעתיד

---

## ⚙️ מצב נוכחי של המערכת (סוף סבב 14)

**Commits אחרונים ב-main:**
- `6659351` security(round14c): Sessions + Encryption — H6/H13
- `1c7c6f9` security(round14b): High Auth — H3/H8/H9/H10
- `bd207ae` feat(cardcom): cron שעתי להתראת אדמין על webhook תקוע
- `2404db6` security(round14a): Critical Infra — C2/C3/C4/H15

**מצב Render:**
- `prisma db push` (ללא `--accept-data-loss`) — בטוח אבל לא אופטימלי (ר' 2.1)
- 21 cron jobs מוגדרים (12 קיימים + 9 שנוספו ב-14a)
- ENCRYPTED_FIELDS כולל: client, sessionNote, transcription, analysis, therapySession, account, insurerSettings, user, savedCardToken, questionnaireResponse
- ENCRYPTED_JSON_FIELDS כולל: client, sessionNote, analysis, questionnaireResponse, intakeResponse

**Tests pre-existing failures (להתעלם, לא קשורים לסבב 14):**
- `src/lib/__tests__/impersonation.test.ts` — 3 failures (loadVerifiedImpersonation)
- `effective-price.test.ts`, `scope.test.ts`, `sms-quota.test.ts` — DATABASE_URL חסר ב-env מקומי

---

**מסמך זה נכתב בסוף סבב 14, 2026-05-19, ע"י Claude Opus 4.7. שיהיה בהצלחה לצ'אט הבא!** 🚀
