# 🔐 הנדאוף לסבב אבטחה 16 (אחרי סיום סבב 15)

**תאריך:** 2026-05-20
**Commits של סבב 15 (כולל):** `dd7fd47`, `c0611d7`, `9236c45`
**מסמך קודם:** `HANDOFF-security-round15.md`
**ביקורת מקור:** `אבטחה קורסור בשילוב הכנה של כלוד.md` (Downloads)

---

## 📊 התמונה הגדולה

סבב 15 סגר את כל ה-quick wins מ-HANDOFF-15 (חלק 1+2) ופריט אחד מ-Medium/Low.
סבב 14 + 15 ביחד תיקנו:
- כל ה-Critical הרלוונטיים (C2/C3/C4 ב-14, 2.2 fix-receipts ב-15)
- כל ה-High הרלוונטיים (H3/H6/H8/H9/H10/H13/H15)
- ה-3 פריטים שהתגלו במהלך סבב 14 (1.1 withAudit, 1.2 XFF, 1.3 double-import)
- 2 פריטי Low/Medium (L5 RTL filename, E1 console→logger)
- 1 חוסם שזוהה ב-pre-push agents (audit-log UI null-safe)

**סבב 16 מטפל ב-13 פריצות אמיתיות (אישרתי מול קוד חי) + 6 פערים רגולטוריים דחויים לסבב 17:**

**🟠 High (4):** H16.1 IDOR ב-CommunicationLog · H16.2 NextAuth cookies hardening · H16.3 DOMPurify 3.12→4.x · H16.4 CSP nonce-based
**🟡 Medium (6):** M16.5 cache no-store · M16.6 NEXTAUTH_URL fallback · M16.7 sharp size check · M16.8 encryption dev key · M16.9 Communication encrypt · M16.10 Recovery rotation
**🟢 Low (3):** L16.11 logger filename regex · L16.12 .npmrc · L16.13 Permissions-Policy

**תוכנית סופית:** `C:\Users\User\.claude\plans\staged-sniffing-walrus.md`
**סיכום למשתמש (להורדות):** `c:\Users\User\Downloads\תיקון אבטחה מ-20-5 קלוד.md`

### Checklist סבב 16

| # | פריצה | Status | Commit |
|---|-------|--------|--------|
| 16a-1 | M16.8 ENCRYPTION_KEY dev 42→64 | pending | — |
| 16a-2 | L16.11 logger FILENAME_KEY_REGEX | pending | — |
| 16a-3 | L16.12 .npmrc audit-level | pending | — |
| 16a-4 | L16.13 Permissions-Policy interest-cohort | pending | — |
| 16b-1 | M16.5 uploads Cache-Control no-store | pending | — |
| 16b-2 | M16.6 forgot-password NEXTAUTH_URL | pending | — |
| 16b-3 | M16.7 sharp output size check | pending | — |
| 16c | H16.1 CommunicationLog IDOR scope | pending | — |
| 16d | H16.3 DOMPurify upgrade 3.12→4.x | pending | — |
| 16e | H16.2 NextAuth cookies SameSite=Strict | pending | — |
| 16f | M16.9 Communication body encryption + migration | pending | — |
| 16g | M16.10 Recovery codes rotation UX | pending | — |
| 16h | H16.4 CSP nonce-based | pending | — |

**הערה:** הפריטים שבחלקים 2-4 למטה (npm audit, architecture cleanup, Medium נוספים) הם המלצות מסבב 15 — חלקם חופפים לרשימה שלי (H16.3 = DOMPurify מ-1.2). הסבב הזה מתרכז ב-13 הפריצות לעיל; השאר ידחו לסבב 17.

---

## 🛑 חובה לקרוא לפני שמתחילים

1. `feedback_security_fixes.md` — 10 חוקי אבטחה (חייב!)
2. `feedback_coding_standards.md` — T3, Prisma, force-dynamic
3. `feedback_parallel_chats.md` — לא `git add .`
4. `feedback_pre_push.md` — 5 סוכנים מקבילים
5. `HANDOFF-security-round15.md` בשורש — כל מה שנעשה
6. `HANDOFF-security-round14.md` בשורש — context קודם

---

## 🔥 חלק 1 — npm Vulnerabilities (P0 קריטי)

`npm audit` חושף 27 פגיעויות. רוב הן ב-transitive dependencies. דורש זהירות — שדרוג של hono/dompurify/effect יכול לשבור התנהגות.

### 1.1 — `npm audit fix` (לא breaking changes)

הרץ ראשון:
```bash
npm audit fix
```

זה יתקן את הפגיעויות שיש להן fix path לא-breaking. רוב הסיכוי שיכלול:
- `uuid` (moderate) — buffer bounds check
- `vite` (high) — 3 vulnerabilities, אבל זו dependency של dev בלבד

**אחרי:** הרץ `npm test` ו-`npx tsc --noEmit` כדי לוודא שלא נשבר כלום.

### 1.2 — פגיעויות breaking (דורשות החלטה)

**xlsx (high, no fix available)** — חבילה זנוחה.
- **Vulnerability:** Prototype Pollution + ReDoS
- **בקובץ:** בודק את ה-imports של xlsx בקוד — אם זה רק לקריאת קבצים (לא דינמי), הסיכון נמוך
- **המלצה:** החלף ל-`exceljs` או `read-excel-file`. דורש refactor של כל מקום שמשתמש ב-`xlsx.read`/`xlsx.utils`.

**hono ≤4.12.17 (high, 17 vulns)** — אם בכלל בשימוש
- בדוק: `grep -r "from ['\"]hono" src/` — אם לא בשימוש ישיר, זו transitive. שדרוג ב-`npm update` יעזור.

**dompurify ≤3.3.3 (high, 10 XSS)**
- `grep -r "from ['\"]dompurify" src/` — אם בשימוש ל-sanitization של HTML.
- שדרוג ל-`dompurify@^3.4.0` (לבדוק breaking changes).

**defu ≤6.1.4 (high, prototype pollution)**
- בד"כ transitive. `npm ls defu` יראה מי תלוי.

### 1.3 — סדר ביצוע מומלץ

```bash
# 1. הרץ npm audit לראות מצב נוכחי
npm audit --audit-level=high

# 2. תיקון לא-breaking
npm audit fix

# 3. הרץ מבחנים
npx tsc --noEmit
npx vitest run
npx next build  # חשוב — לבדוק את ה-build

# 4. אם הכל עובד — commit
git add package.json package-lock.json
git commit -m "security(round16a): npm audit fix"

# 5. הערכת xlsx replacement (refactor נפרד, יום+)
# 6. הערכת hono/dompurify upgrade (לפי השימוש בפועל)
```

**⚠️ חשוב:** אל תפעיל `npm audit fix --force` בלי בדיקה — זה יכול לשבור hono major version ועוד.

---

## 🟠 חלק 2 — Medium שנמצאו בסקירת סבב 15

### 2.1 — `cardcom-invoice-sync` audit אינו atomic ⚠️ Architecture

**הבעיה (זוהתה ע"י סוכן #2 ו-#3 ב-pre-push):**

ב-`src/app/api/cron/cardcom-invoice-sync/route.ts:249-264`, ה-`withAudit` משמש עם no-op function ($pattern audit-only). זה אומר:
- ה-mutations (orphan creates, adminAlert) נכתבות **מחוץ** ל-tx
- ה-audit row נכתב ב-tx נפרד **אחרי**
- אם ה-audit נכשל → ה-mutations כבר קרו
- אם ה-mutations נכשלו mid-sync → ה-audit לא יירשם

**זה לא atomicity אמיתי — זה "audit best-effort".**

**הסיבה לארכיטקטורה הזו:** `syncForConfig` עושה HTTP calls ל-Cardcom (`searchCardcomDocuments`). הכנסת HTTP IO בתוך transaction = anti-pattern (תופסת connection ל-10 שניות).

**הפתרון לעתיד:**
```ts
// Refactor syncForConfig:
// 1. Phase 1 — fetch (outside tx): HTTP + read DB
// 2. Phase 2 — write plan (data structure):
//    { orphans: [...], updates: [...], alerts: [...] }
// 3. Phase 3 — apply plan + audit (inside one tx): atomic
```

**עדיפות:** P2 (Medium). לא compliance breaking אבל ראוי לתיקון בעתיד.

### 2.2 — `promote-pending-tiers` — tx timeout פוטנציאלי

**הבעיה (סוכן #2):**

ב-`src/app/api/cron/promote-pending-tiers/route.ts:43-81`, ה-loop של `tx.user.update` רץ בתוך tx Serializable עם timeout 10s.

- ~10ms per update × 1000 users = ~10s → קרוב לlimit
- 5000+ users במצב pending → timeout בטוח

**מצב נוכחי:** הקרון יומי, נדיר שיש >100 users pending בו זמנית. סיכון נמוך.

**הפתרון לעתיד:**
```ts
// במקום loop:
const groups = new Map<AiTier, string[]>();
for (const u of candidates) {
  if (!u.pendingTier) continue;
  if (!groups.has(u.pendingTier)) groups.set(u.pendingTier, []);
  groups.get(u.pendingTier)!.push(u.id);
}
for (const [tier, ids] of groups) {
  await tx.user.updateMany({
    where: { id: { in: ids } },
    data: { aiTier: tier, pendingTier: null, pendingTierEffectiveAt: null },
  });
}
```

**עדיפות:** P2.

### 2.3 — `fix-stuck-payments` — race עם webhook

**הבעיה (סוכן #2):**

ה-tx Serializable של fix-stuck-payments יכול להחזיר 40001 (serialization failure) אם webhook של Cardcom מעדכן את אותה שורה במקביל. ה-retry של `withAudit` (3 ניסיונות) יטפל, אבל זה pollution קל ב-DB אם יש עומס.

**עדיפות:** P3 (Low).

### 2.4 — `migrateParentReceiptsToChildren` ללא audit

**הבעיה (סוכן #3):**

`src/lib/payments/bulk-payment.ts:742-799` — הפונקציה שמקדם receipt tokens — לא עוטפת ב-`withAudit`. פעולה רגישה (משנה token data) שצריכה audit trail.

**הפתרון:**
```ts
// בdir bulk-payment.ts:742 — להוסיף actor parameter
async migrateParentReceiptsToChildren(actor: AuditActor) {
  return await withAudit(
    actor,
    { action: "migrate_parent_receipts", targetType: "payment", details: {...} },
    async (tx) => { /* existing logic adapted to tx */ }
  );
}

// ב-fix-receipts/route.ts:14:
const actor: AuditActor = { kind: "user", session };
const result = await migrateParentReceiptsToChildren(actor);
```

**עדיפות:** P2.

### 2.5 — `sanitizeDownloadFilename` ללא unit tests

**הבעיה (סוכן #3):**

`src/lib/file-validation.ts:286-326` — ה-helper החדש קריטי לאבטחה (RTL spoofing) אבל ללא test coverage.

**הפתרון:** הוסף `src/lib/__tests__/file-validation.test.ts` עם:
- Test לכל 8 קודי Unicode bidi-override (U+200E, U+200F, U+202A-E, U+2066-9)
- Test ל-non-ASCII chars
- Test ל-empty/null filename
- Test ל-quote injection (`"`, `\r`, `\n`)

**עדיפות:** P2.

### 2.6 — Static import של `createHash` ב-resend webhook

**הבעיה (סוכן #5):**

ב-`src/app/api/webhooks/resend/route.ts:181-185` (השורה שהוספתי בסבב 15b) — `createHash` מיובא דינמית (`await import("node:crypto")`). זה דווקא הדפוס שתוקן בחלק 1.3 של סבב 15 ב-register/route.ts!

**הפתרון:**
```ts
// בראש הקובץ:
import { createHash } from "node:crypto";
// ובלוגיקה:
const emailHash = createHash("sha256").update(senderEmail).digest("hex").slice(0, 8);
```

**עדיפות:** P3 (קוסמטי).

---

## 🟡 חלק 3 — Medium נוספים שלא טופלו בסבב 15

מתוך triage של 3 סוכני Explore בסבב 15:

### 3.1 — Encrypt Recording.audioUrl (אם מכיל auth token)

**Source:** סוכן Explore Group E-H

**הסבר:** `Recording.audioUrl` נשמר plaintext. אם זה signed URL עם auth token, יש דליפה ב-DB.

**בדיקה:** Grep פורמט ה-URL.

**עדיפות:** P2 (תלוי במה ה-URL מכיל).

### 3.2 — בדיקת `SupportTicketNote` encryption

**Source:** סוכן Explore Group E-H

**הסבר:** האם content של SupportTicketNote יכול להכיל PHI? אם כן, צריך ENCRYPTED_FIELDS.

**עדיפות:** P2.

### 3.3 — Subscription audit gaps

**Source:** סוכן Explore Group E-H

**הסבר:** Block/unblock user, role change, password reset by admin — האם רושמים ל-AdminAuditLog?

**עדיפות:** P2.

### 3.4 — Admin routes שעוד לא נבדקו

**Source:** סוכן Explore Group A-D

לדוגמה: `src/app/api/admin/subscriptions/route.ts` (אם קיים) — האם חסר permission?

**פעולה:** Grep רחב לכל `admin/.../route.ts` שלא משתמש ב-`requirePermission()`.

**עדיפות:** P2.

---

## 🟢 חלק 4 — Low (~22 פתוחים)

ר' חלק 4 ב-`HANDOFF-security-round15.md`. סבב 15 טיפל ב-L5 (RTL filename). הנותרים:

- L1: JWT cache 30s window — ✅ תקין (יש invalidateJwtCache + sessionVersion)
- L2: CRON_SECRET_PREVIOUS rotation alert — ✅ קיים מנגנון
- L3: Booking slug enumeration — ✅ כבר uniform (אותה הודעה ל-2 המקרים)
- L6: Audit log חסר ב-2FA verify — ✅ קיים
- ועוד ~18 פריטים — לקרוא במסמך המקורי של קורסור

**עדיפות:** P3.

---

## 📋 פעולות ידניות של המשתמש (מ-HANDOFF 15)

עדיין ממתינות:

### A. Cardcom env vars (תלוי במשתמש להפעלת חיוב)

הוסף ל-Render Dashboard (כש-Cardcom production מופעל):
- `CARDCOM_USERNAME`
- `CARDCOM_TERMINAL_NUMBER`
- `CARDCOM_API_KEY`
- `CARDCOM_TERMINAL_PASSWORD`
- `CARDCOM_INVOICE_HEADER`
- `CARDCOM_TENANT_USER_ID`
- (פירוט מלא ב-`memory/project_cardcom_env_vars_pending.md`)

### B. C2 — מעבר ל-`prisma migrate deploy` (מסבב 14a)

**ר' HANDOFF-15 חלק 2.1** — דורש:
1. גיבוי DB ב-Render Dashboard
2. Render Shell + `prisma migrate resolve --applied`
3. אז דחיפת השינוי ב-`render.yaml` + `package.json`

**סטטוס:** עדיין פתוח.

### C. אישור push לסבב 15

אישור explicit מהמשתמש ל-`git push origin main` של 3 הcommits:
- `dd7fd47` (round15a)
- `c0611d7` (round15b)
- `9236c45` (round15c)

---

## 🎯 סדר ביצוע מומלץ לסבב 16

**שלב 1 — Push של סבב 15 (כשהמשתמש מאשר):**
```bash
git push origin main
```

**שלב 2 — npm audit fix (P0):**
- ר' חלק 1 לעיל
- אחרי: tsc, vitest, next build, commit, push

**שלב 3 — Medium architecture cleanup (P2):**
- 2.1, 2.2, 2.4 — refactor של 3 קבצים
- Tests של 2.5
- 2.6 cosmetic

**שלב 4 — חלק 3 (Medium נוספים):**
- בחר 3-5 הקריטיים ביותר

**שלב 5 — מעבר ל-prisma migrate deploy (פעולה ידנית של המשתמש):**
- ר' B לעיל

---

## ⚙️ מצב נוכחי של המערכת (סוף סבב 15)

**Commits אחרונים ב-main:**
- `9236c45` security(round15c): null-safe audit-log UI ל-system events
- `c0611d7` security(round15b): ADMIN check ל-fix-receipts + RTL filename + console→logger
- `dd7fd47` security(round15a): withAudit ב-4 crons + XFF + register cleanup
- `6659351` security(round14c): Sessions + Encryption — H6/H13

**Tests pre-existing failures (להתעלם):**
- `src/lib/__tests__/impersonation.test.ts` — 3 failures
- `effective-price.test.ts`, `scope.test.ts`, `sms-quota.test.ts` — DATABASE_URL חסר ב-env מקומי

**Build:** הסוכן זיהה שגיאת tailwindcss/globals.css **לא קשורה לסבב 15** — צריך לוודא ב-CI/production.

---

**מסמך זה נכתב בסוף סבב 15, 2026-05-20, ע"י Claude Opus 4.7. שיהיה בהצלחה לצ'אט הבא!** 🚀
