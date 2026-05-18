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

(יתעדכן תוך כדי עבודה)
