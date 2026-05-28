# HANDOFF — תיקון פגיעויות חבילות (Snyk + npm audit)

**תאריך:** 2026-05-28
**מקור:** דוח Snyk + `npm audit`
**מטרה:** סגירת פגיעויות בתלויות טרנזיטיביות באמצעות `overrides` ב-package.json

**הערה:** סבב זה לא קשור ל-`HANDOFF-security-round17.md` (compliance) שעובד עליו צ'אט אחר.

**צ'אטים מקבילים — לא לגעת:**
- `src/app/(dashboard)/dashboard/ai-prep/page.tsx`
- `src/app/api/clients/[id]/add-credit/route.ts`
- `HANDOFF-health-fund.md`
- `HANDOFF-phase3-followup.md`
- `HANDOFF-security-round17.md`

---

## רקע

Snyk דיווח על 4 פגיעויות:

| # | חבילה | חומרה | CVE | מקור |
|---|---|---|---|---|
| 1 | uuid@8.3.2 | Moderate (6.3) | CWE-1285 | exceljs@4.4.0 + next-auth@4.24.14 |
| 2 | inflight@1.0.6 | Moderate (6.2) | CWE-772 | exceljs (archiver→glob→inflight) |
| 3 | postcss@8.4.31 | Moderate (5.3) | CWE-79 (XSS) | next@16.2.6 |
| 4 | @hono/node-server@1.19.11 | Moderate (6.9) | CWE-22 (traversal) | prisma@7.8.0 (@prisma/dev) |

`npm audit` חשף **בעיה נוספת חמורה יותר** שלא דווחה ב-Snyk:

| 5 | **tmp < 0.2.6** | **HIGH** | CWE-22 (path traversal) | תלות עמוקה |

---

## תכנית פעולה — checklist

### תיקון 1: uuid (8.3.2 → 11.x via overrides) — pending
- [ ] להוסיף `"uuid": "^11.1.0"` ל-overrides
- [ ] לוודא תאימות API — `uuid.v4()` ו-`uuid.v1()` זהים מאז 3.x → 14.x

### תיקון 2: postcss (8.4.31 → 8.5.10+ via overrides) — pending
- [ ] להוסיף `"postcss": "^8.5.10"` ל-overrides

### תיקון 3: @hono/node-server (1.19.11 → 1.19.13+ via overrides) — pending
- [ ] להוסיף `"@hono/node-server": "^1.19.13"` ל-overrides

### תיקון 4: tmp (<0.2.6 → ^0.2.6 via overrides) — pending
- [ ] להוסיף `"tmp": "^0.2.6"` ל-overrides

### תיקון 5 (אופציונלי): inflight
- [ ] **דילוג:** inflight 1.0.6 נטוש. השרשרת היא exceljs→archiver→glob@7→inflight.
- [ ] **הנמקה:** CVSS 6.2 (memory leak בלבד, לא RCE/data leak). exceljs רץ רק כשמייצאים XLSX.
- [ ] **תיעוד:** known issue, deferred to next exceljs major release

---

## בדיקות חובה

1. `npx tsc --noEmit` — נקי
2. `npx vitest run` — אין regressions
3. `npm run build` — Next build עובר (במידת האפשר)
4. `npm audit` — 0 vulnerabilities (חוץ מ-inflight אם נשאר)

## סוכנים לפני push (לפי feedback_security_fixes + feedback_pre_push)

### 5 סוכנים מקבילים (3 סנכרון + 2 תקינות)
1. תקינות קוד (build + tsc + tests)
2. סנכרון מערכת (uuid → next-auth sessions / exceljs Excel)
3. UX (login, ייצוא Excel, AI prep)
4. אבטחה (postcss XSS / hono traversal / tmp traversal)
5. ביצועים וקצוות

### 2 סוכני אבטחה
6. סייבר — האם ה-CVEs באמת סגורים?
7. תקינות-אבטחה — האם ה-overrides לא שוברים flows קיימים?

---

## קבצים בטיפול

**רק שלי:**
- `package.json` — הוספת בלוק `overrides`
- `package-lock.json` — מתעדכן אוטומטית
- `HANDOFF-snyk-packages.md` — מסמך זה

---

## סטטוס

- **שלב נוכחי:** הסתיים — מוכן ל-push
- **השלמה:** 2026-05-28

---

## תוצאות הביצוע

### ✅ הצלחה — כל ה-CVEs נסגרו
- `npm audit` → **0 vulnerabilities**
- uuid: `8.3.2 → 14.0.0` (deduped בכל המקומות)
- postcss: `8.4.31 → 8.5.15` (^8.5.10 override → npm בחר 8.5.15)
- @hono/node-server: `1.19.11 → 1.19.14`
- tmp: `<0.2.6 → 0.2.7`
- inflight: **נשאר** (deferred — אין supported fix)

### ✅ בדיקות תקינות
- `npx tsc --noEmit` — נקי
- `npx vitest run` — **656 passed, 4 todo, 0 failed**
- `npx next build` — exit code 0 ✅

### ✅ 7 סוכנים — כולם אישרו
1. תקינות קוד ✅
2. סנכרון מערכת ✅
3. UX ✅
4. אבטחה — כל ה-CVEs סגורים ✅
5. תקינות-אבטחה ✅ (postcss override `^8.5.10` קיבל 8.5.15 — תואם peer)
6. סייבר PHI ✅ (אין supply-chain חשוד, אין IDOR חדש)
7. Runtime — uuid 14 ESM כבר רץ ב-production מ-`07d411bd` (2026-05-26) — Node 22 ב-Render עובד ✅

### Lessons learned
- npm `overrides` עם דרישה גבוהה מהתלות הישירה — נכשל. **חייב להתאים** לגרסת התלות הישירה (uuid 14 ↔ override ^14).
- `npm audit` יכול לחשוף בעיות ש-Snyk מפסיד (tmp HIGH severity).
- `^X.Y.Z` ב-override → npm יבחר את הגבוה ביותר התואם, אז `^8.5.10` נתן 8.5.15 (שמתאים גם ל-peer של @tailwindcss/postcss).
