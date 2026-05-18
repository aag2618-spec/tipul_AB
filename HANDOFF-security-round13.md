# 🔐 הנדאוף — סבב אבטחה 13

**תאריך התחלה:** 2026-05-18
**Commit בסיס:** `9a3dc06` (סוף סבב 12, ב-origin/main)
**מסמכי רקע:** `HANDOFF-security-round{7,8,9,10,11,12}.md`

---

## 🎯 הקשר

המערכת היא **mytipul** — תוכנת ניהול קליניקה לפסיכותרפיסטים, מכילה PHI. עברה 12 סבבי אבטחה. סבב 13 ממשיך residual items מסבב 12 + defense-in-depth.

---

## ✅ Checklist — פריטי סבב 13 (לעיבוד בסדר מומלץ)

### 🟠 גבוה — DB constraint עם backup

#### M13.1 — `@@unique([phone])` ב-Prisma `User` (defense-in-depth ל-M2 של סבב 11) — ⏸️ דורש אישור משתמש
- דורש backup לפני
- בדיקה ב-DB: `SELECT phone, COUNT(*) FROM "User" WHERE phone IS NOT NULL GROUP BY phone HAVING COUNT(*) > 1`
- אם יש כפילויות — להחליט merge/null ידני
- הוספת `@@unique([phone])` ל-schema + migration
- עדכון error handling ב-routes שיוצרים users (לתפוס P2002)
- **status: pending — דורש אישור משתמש כי משנה DB**

---

### 🟡 בינוני — Defense-in-depth (שיפורים)

#### M13.7 — AI prompt injection ב-questionnaire/* + session-prep — 🔄 in_progress
- 4 routes לעטוף ב-XML delimiters לפי pattern M12.5:
  - `src/app/api/ai/questionnaire/analyze-single/route.ts` — `response.answers` (HIGH) + `culturalContext` (MED)
  - `src/app/api/ai/questionnaire/analyze-combined/route.ts` — `questionnairesSummary` (subscores) + `culturalContext`
  - `src/app/api/ai/questionnaire/progress-report/route.ts` — `sessionsSummary` (sessionNote.content — HIGH) + `culturalContext`
  - `src/app/api/ai/session-prep/route.ts` — `notesText` (sessionNote.content — HIGH) + `clientApproachNotes` + `culturalContext`
- **status: pending**

#### M13.3 — Rate-limit על POST /api/recordings
- חיווט ל-`src/lib/rate-limit.ts` (~10 בדקה פר-userId)
- **status: pending**

#### M13.4 — Rate-limit על 3 exports
- `src/app/api/clients/[id]/export/route.ts`
- `src/app/api/clients/export-all/route.ts`
- `src/app/api/payments/export/route.ts`
- ~3 בשעה פר-userId
- **status: pending**

#### M13.2 — CSP report-uri + endpoint
- בניית `/api/csp-report` עם rate-limit פר-IP + logger.warn
- הוספת `report-uri` ל-CSP ב-`next.config.ts`
- שיקול: `Reporting-Endpoints`/`Report-To` (modern API)
- לא להפעיל COEP=require-corp — שובר Cardcom iframe
- **status: pending**

#### M13.8 — MANAGER data minimization ב-/api/admin/users
- בדיקה: האם MANAGER צריך email+phone של כל המשתמשים?
- אם לא — לסנן
- **status: pending — דורש בירור עם משתמש על הצורך העסקי**

---

### 🟢 נמוך — תחזוקה

#### M13.10 — מחיקת `claude.ts` (dead code)
- `git rm src/lib/claude.ts` (זוהה ב-M12.5 כ-dead code)
- הסרת `@anthropic-ai/sdk` מ-package.json (אם לא בשימוש)
- **status: pending — דורש אישור משתמש**

---

### ⏸️ דורש דיון מערכתי / infrastructure

#### M13.5 — Pagination ב-clients/export-all
- streaming או pagination chunks
- דורש דיון — לא תיקון פשוט
- **status: deferred — דורש דיון מערכתי**

#### M13.6 — Recordings orphan cleanup
- GDPR/חוק הגנת הפרטיות
- שלוש אפשרויות: cron cleanup / Cascade / decision
- **status: deferred — דורש החלטה מערכתית**

#### M13.9 — Encryption at rest לקבצי audio
- Render persistent disk encryption (infra) **או** application-level
- **status: deferred — תלוי infrastructure**

---

## 🚫 קבצי M1 — אסור לגעת

- `src/app/api/clients/[id]/route.ts`
- `src/app/api/clients/route.ts`
- `src/lib/validations/client.ts`
- `src/lib/scope.ts`
- `src/app/(dashboard)/dashboard/clients/[id]/edit/page.tsx`
- `src/app/(dashboard)/dashboard/clients/new/page.tsx`
- `src/app/(dashboard)/dashboard/clients/[id]/page.tsx`

## 🤖 צ'אטים מקבילים — לא לגעת

- `HANDOFF-aitier-not-upgrading.md`
- `HANDOFF-subscription-upgrade.md`
- `src/app/api/admin/users/[id]/financial/route.ts`
- `src/components/admin/subscription-admin-card.tsx`
- `src/app/api/admin/cardcom-transactions/` (folder)

---

## 📊 Snapshot התחלה

- **Last commit:** `9a3dc06` — security(M12): cleanup console.error in auth.ts + pre-push log
- **Tests baseline:** 4 files fail / 3 tests fail (impersonation + scope + effective-price + sms-quota) / 538 passed — חייב לשמור!
- **TypeScript:** נקי
- **Build:** לא נבדק — לבצע ב-pre-push

---

## 🔄 Progress Log

### 2026-05-18

**✅ M13.7 — DONE** (commit `fb60f9f`)
- 4 AI routes קיבלו XML delimiters + instruction defense לפי pattern M12.5
- `analyze-single`: `<questionnaire_answers>`/`<questionnaire_subscores>`/`<cultural_context>`
- `analyze-combined`: `<questionnaires_data>`/`<cultural_context>`
- `progress-report`: `<session_notes>`/`<questionnaires_data>`/`<cultural_context>`
- `session-prep` (Professional + Enterprise): `<session_notes>`/`<approach_notes>`/`<cultural_context>`/`<questionnaires_data>`
- TypeScript: נקי

**✅ M13.3 — DONE** (commit pending)
- הוספת `RECORDING_UPLOAD_PER_USER` = 10/דקה ב-`src/lib/rate-limit.ts`
- חיווט ל-`POST /api/recordings` (אחרי auth+scope, לפני parse+DB)

**✅ M13.4 — DONE** (commit `e4aa5ab`)
- הוספת `EXPORT_RATE_LIMIT` = 3/שעה ב-`src/lib/rate-limit.ts`
- חיווט ל-3 endpoints:
  - `GET /api/clients/[id]/export`
  - `GET /api/clients/export-all`
  - `GET /api/payments/export`
- TypeScript: נקי

**✅ M13.2 — DONE** (commit pending)
- בניית `POST /api/csp-report`:
  - תומך ב-legacy format (`application/csp-report`) וב-Reports API (array)
  - rate-limit פר-IP (`CSP_REPORT_PER_IP` = 60/דקה)
  - body cap 16KB
  - logger.warn (לא DB) — אין הצפת stderr
  - אין auth (browser-initiated)
- הוספת `report-uri /api/csp-report` ל-CSP ב-`next.config.ts`
- TypeScript: נקי

**✅ M13.8 — DONE** (commit `8183007`)
- field filtering ב-`GET /api/admin/users` לפי role (consistent עם `/api/admin/users/[id]`)
- ADMIN: כולל `aiUsageStats` (currentMonthCalls/Cost/dailyCalls)
- MANAGER + שאר: בלי `aiUsageStats`
- UI כבר עם `?.` + fallback `|| 0` — לא קורס

### 🛡️ Pre-Push Validation — סבב 1

| Agent | Status | הערות |
|-------|--------|-------|
| Auth/Session/2FA | ✅ PASS | לא רלוונטי — השינויים לא נוגעים ב-auth |
| Payments/Cardcom/Webhooks | ✅ PASS | webhook flows + subscription + refund שלמים |
| AI/Scope/Cron/Audit | ⚠️ FAIL | באג סדר checks ב-`analyze-single` — scope אחרי tier/quota |
| Build + TS + Tests | ✅ PASS | tsc נקי, tests baseline (4 files / 3 tests fail / 538 passed) |
| Code Quality | ✅ PASS עם 2 הערות קוסמטיות | `{ error }` vs `{ message }`, סדר rate-limit/scope ב-payments/export |

### 🔧 Fix לסבב 1

**fix(M13.7 pre-push):** `analyze-single/route.ts` — הזזת `loadScopeUser` + `isSecretary` לפני `prisma.user.findUnique` + tier checks. עקבי עם 3 ה-routes האחרים. אין הוספה — רק reorder + הסרת בלוק כפול.

### 🛡️ Pre-Push Validation — סבב 2

| Agent | Status | הערות |
|-------|--------|-------|
| AI/Scope (אימות תיקון) | ✅ PASS | סדר checks תקין: auth → parseBody → scope → user → tier → DB findFirst → consent. אין double-decl. M13.7 XML coverage נשמר. |
| Build + TS + Tests | ✅ PASS | tsc=0 errors, tests=baseline בדיוק (28 passed / 4 failed / 1 skipped files; 538 passed / 3 failed / 4 todo). |

**מסקנה:** 2/2 PASS. מוכן ל-push בכפוף לאישור משתמש.

---

### 🆕 M13.10 — DONE (2026-05-19)

**מה בוצע:**
- `git rm src/lib/claude.ts` (dead code — אף route לא ייבא ממנו)
- `npm uninstall @anthropic-ai/sdk` — חבילה הוסרה מ-package.json + package-lock.json
- ניקוי `src/lib/env.ts`: הסרת `ANTHROPIC_API_KEY` (לא היה בשימוש)
- ניקוי `render.yaml`: הסרת env var `ANTHROPIC_API_KEY`
- robots.txt: השאיר User-Agent `anthropic-ai` (זה bot של Anthropic לסקרייפ, לא קשור ל-SDK)

**ירידה:** ~5MB מ-node_modules, attack surface פחות (חבילה אחת פחות לפגיעות).

**אם תרצה להחזיר Claude SDK בעתיד:** `npm install @anthropic-ai/sdk`, ולשחזר אחד הקבצים מ-git history.

---

### 🆕 M13.5 — DONE partial (2026-05-19)

**מה בוצע:**
- guard ב-`export-all` route: לפני findMany — `prisma.client.count({ where: scopeWhere })`. אם > 500 → 413 עם הודעה ברורה.
- מונע memory crash בארגון 1000+ מטופלים שעדיין לא קיים בפועל.

**מה לא בוצע (pagination/streaming אמיתי):**
- ידחה לסבב עתידי כשיהיה ארגון בגודל זה — נראה ה-bottleneck האמיתי ונתכנן data-driven.

---

### 🆕 M13.9 — INFRASTRUCTURE ACTION REQUIRED (2026-05-19)

**מה צריך לעשות (משתמש, לא קוד):**

1. **לוגין ל-Render dashboard** → https://dashboard.render.com
2. **לבחור את ה-service** "tipul-app"
3. **לעבור ללשונית "Disks"** (או "Persistent Disks")
4. **לבחור את ה-disk** שמוגדר ב-`UPLOADS_DIR` (כרגע: `/opt/render/project/uploads`)
5. **לבדוק האם "Encryption at rest" כבר מופעל**:
   - אם **כן** — לא צריך לעשות כלום
   - אם **לא** — לחפש "Enable encryption" (יתכן שיופיע רק ב-plan upgraded; ב-free plan לא תמיד זמין)

**הערה חשובה:** ב-Render's free tier יתכן ש-disk encryption לא זמין/אוטומטי. אם זה ה-case — לשקול שדרוג ל-Starter ($7/m) שכולל disk encryption.

**גיבוי (אופציה ב' — application-level encryption):**
- אם Render לא מאפשר מ-disk encryption, יש לתעד החלטה האם לעבור ל-application-level encryption (encrypt/decrypt לכל audio file בקוד).
- זה דורש עבודת קוד בסבב נפרד.

---

### 🆕 M13.6 — DONE (2026-05-19)

**מה בוצע:**
- חדש: `src/app/api/cron/recording-orphan-cleanup/route.ts`
- מוחק Recording rows + audio files של orphans (clientId=null AND sessionId=null) שעברו 90 ימים
- Cascade ל-Transcription + Analysis אוטומטי (schema קיים)
- audit log מלא
- path-traversal guard
- ENOENT idempotency
- batch 100 × max 20 (2000/ריצה)
- `render.yaml`: cron schedule `0 1 * * *` (01:00 UTC = 04:00 ישראל), נפרד מ-audit retention

**Pre-push:** 10/10 PASS

**Findings לעתיד:**
- 🟡 ה-DELETE של recording רגיל (`/api/recordings/[id]` DELETE) **לא מוחק את ה-audio file מ-disk** — רק את ה-DB row. זה bug נפרד. לתקן בסבב 14: להוסיף `fs.unlink` ב-DELETE flow לפני `prisma.recording.deleteMany`.
