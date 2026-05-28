# HANDOFF: סיום פרויקט "הקליניקה שלי" (M11)

> מסמך זה מכיל את כל מה שנשאר לעשות בפרויקט שיפור פיצ'ר הקליניקה הרב-משתמשית, **כולל את כללי העבודה המחייבים**. הצ'אט הקודם סיים A1-A6, B1-B7, C1-C2, D1, E1, E2, F1. ממשיכים מ-E3 הלאה.

---

## חלק 1: כללי עבודה — חובה לקרוא לפני כל קומיט

### 1.1 סקופ קבצים — strict (חוק יסוד)

- מותר לערוך **רק** קבצים שהמשתמש ביקש במפורש או שנחוצים-במישרין למשימה.
- אסור לגעת בקבצים שמופיעים ב-`git status` עם שינויים שלא ביקשת — אלה של צ'אט אחר.
- אם נראה שצריך לשנות קובץ מחוץ לסקופ — **עצור, ספר למשתמש, ובקש אישור** לפני נגיעה.
- אסור לבצע `git add .` או `git add -A`. תמיד `git add <נתיב מפורש>` לכל קובץ.

### 1.2 ביקורת לפני commit — 5 סוכנים במקביל

לפני **כל** commit (גם תיקון של תו אחד), שלח 5 סוכנים במקביל ב-Task tool:

| סוכן | subagent_type | מטרה |
|---|---|---|
| Security audit | `explore` (readonly) | IDOR, privilege escalation, info-leakage, injection |
| Backward-compat | `explore` (readonly) | רגרסיות בזרימות קיימות, תאימות API |
| Multi-tenancy | `explore` (readonly) | org isolation, RBAC לכל role + impersonation |
| UX & data shape | `explore` (readonly) | TS types, RTL, Hebrew copy, חוזה UI עקבי |
| Build pipeline | `shell` (NOT readonly) | `npx tsc --noEmit`, `npm test`, `npx eslint <files>` |

**חכה שכל 5 יחזרו GREEN לפני commit.** YELLOW/RED → תקן והרץ אותו סוכן שוב, סבב הלוך-חזור עד GREEN.

### 1.3 שמירת תאימות לאחור

- אסור לשבור זרימות קיימות. אם תיקון אבטחה דורש שבירה — בקש אישור מפורש מהמשתמש לפני יישום.
- העדף הוספת capability על פני הקשחה ש"שוברת" UI קיים.
- מתפלים עצמאיים (`organizationId=null`) — חובה לשמור על התנהגות זהה לחלוטין.

### 1.4 הודעות commit + push

- הודעת commit בעברית פשוטה, קצרה (1-2 משפטים), מסבירה את ה-**למה**.
- בגלל PowerShell, השתמש בקובץ זמני להודעה (לא heredoc):
  ```
  Write הודעה ל-.commit-msg-XX.txt
  git commit -F .commit-msg-XX.txt
  Remove-Item .commit-msg-XX.txt
  ```
- **push אוטומטי** מיד אחרי commit מוצלח (`git push`) — אלא אם המשתמש כתב במפורש "אל תדחוף".
- אסור `git commit --amend` על commit שכבר נדחף.

### 1.5 PowerShell — לא Bash

- במקום `&&` השתמש ב-`;` (אם רוצים להמשיך גם בכישלון) או ב-`&&` של PowerShell 7 (אם מובטח).
- נתיבים עם רווחים — תמיד במרכאות כפולות.
- `Select-Object -First N` / `-Last N` / `Select-String` במקום `head` / `tail` / `grep`.

### 1.6 קונבנציות פרויקט (project-conventions)

- כל ה-UI בעברית RTL. תאריכים: `he-IL` + `Asia/Jerusalem`.
- `Prisma Decimal` → `Number(value) || 0` לפני JSX/JSON.
- בכל route API חובה: `export const dynamic = "force-dynamic";`
- `import { logger } from "@/lib/logger"` (לא console).
- כל queries של Prisma בתוך try-catch עם `logger.error`.

---

## חלק 2: מה כבר נעשה (לידיעה, לא לגעת!)

### Phase A — Security & data integrity
- ✅ A1: AIPrep scope למזכירה
- ✅ A2: Insurer report — license attribution
- ✅ A3: Org-level SMS quota
- ✅ A4: Departure billing restore
- ✅ A5: ADMIN bypass removal
- ✅ A6: Invitation password rate limiter

### Phase B — Hardening
- ✅ B1: Transfer orphan sessions
- ✅ B2: PATCH member org guard
- ✅ B3+B4: Public routes rate-limit + login redirect
- ✅ B5: Document/consent form scope
- ✅ B6: Tasks secretary permissions
- ✅ B7: Meshulam paused state

### Phase C — UI gap filling
- ✅ C1: stub pages
- ✅ C2: Owner departures dashboard

### Phase D — Owner tools
- ✅ D1: Owner toolset

### Phase E — Billing semantics
- ✅ E1: aiTier inheritance
- ✅ E2: CustomContract cron + endDate
- 🔴 **E3 (XL): org subscription payment flow** — נשאר!

### Phase F — UX polish
- ✅ F1: UX polish batch (invite page)

### Phase G — New features
- 🔴 G1-G12 — כולם נשארו

---

## חלק 3: מה נשאר — תוכנית עבודה מפורטת

### E3 (XL) — מסלול תשלום מנוי לקליניקה
**גודל:** XL (4-7 קומיטים)
**עדיפות:** גבוהה — לולאת הכסף של הקליניקה לא סגורה כרגע.

**הבעיה:** היום הקליניקה מוגדרת עם `pricingPlan` או `customContract`, אבל **אין מנגנון חיוב חוזר אוטומטי**. הבעלים מוגדר ל-`billingPaidByClinic`, אבל מי גובה ממנו את הכסף בפועל?

**מה צריך לבנות:**
1. **מודל DB חדש** — `OrganizationSubscription`:
   - `organizationId` (יחיד)
   - `status` (TRIALING / ACTIVE / PAST_DUE / SUSPENDED / CANCELLED)
   - `nextBillingDate`
   - `lastChargeAt`
   - `cardcomTokenId` (token שמור לחיוב חוזר)
   - `gracePeriodEndsAt`

2. **API חדש** — `/api/clinic-admin/billing/setup` (יצירת token Cardcom)
3. **API חדש** — `/api/clinic-admin/billing/cancel`
4. **Cron יומי** — `org-subscription-charge`:
   - מוצא orgs שמועד החיוב הגיע
   - מחייב דרך Cardcom recurring API
   - אם נכשל → PAST_DUE + retry ב-3/7 ימים
   - אם נכשל 3 פעמים → SUSPENDED + השעיית גישה לכל החברים
5. **UI חדש** ב-`/clinic-admin/billing` — חיוב, חשבוניות, ביטול
6. **Cardcom integration** — recurring tokenization (התשתית כבר קיימת ל-user-level)

**אזהרות מיוחדות:**
- חובת `withAudit` על כל transaction כספית
- חובת idempotency keys למניעת חיוב כפול
- בחיוב נכשל — אסור להשעות מיידית; חובה grace period של 7 ימים
- Hebrew copy חשוב — UI כספי = רגיש לבלבול
- שמירת `cardcomTokenId` בצורה מוצפנת (לא בטקסט גלוי)

---

### G1 — פיקוח קליני (Clinical Supervision)
**גודל:** L (3-4 קומיטים)

**מה זה?** במקצועות הטיפוליים, מטפלים חדשים (סטז'ר/קליניצן ראשון) חייבים פיקוח של מטפל בכיר. הסופרווייזר רואה את התיקים שלהם, מקבל סיכומי פגישות, ויכול להוסיף הערות פיקוח חסויות (לא נחשפות למטופל).

**מה צריך לבנות:**
1. **שדה ב-User** — `supervisorId` (FK ל-User)
2. **מודל חדש** — `SupervisionNote`:
   - `superviseeId`, `supervisorId`, `clientId?`, `sessionId?`
   - `note` (text)
   - `visibility: PRIVATE | SUPERVISEE` (האם המטפל הזוטר רואה)
3. **API** — `/api/supervision/*`
4. **UI** — `/dashboard/supervision`:
   - לסופרווייזר: רשימת supervisees + תיקים שלהם
   - הוספת הערות פיקוח
   - dashboard ראייה מהירה
5. **הרשאות** — OWNER יכול לקבוע מי סופרווייזר של מי
6. **scope** — סופרווייזר רואה את התיקים של supervisees, **רק לקריאה**

**שיקולי אבטחה:**
- אסור שסופרווייזר ימחק/יערוך תיק של supervisee
- הערות PRIVATE אסור שיופיעו ב-API שמטפל זוטר קורא ממנו
- אם supervisee עוזב → ההערות נשארות, אבל אין יותר supervisor relationship

---

### G2 — סניפים (Multi-location)
**גודל:** L (3-4 קומיטים)

**מה זה?** קליניקה רשת עם כמה סניפים פיזיים. כל סניף עם כתובת, שעות פעילות, ומטפלים משויכים.

**מה צריך לבנות:**
1. **מודל חדש** — `ClinicLocation`:
   - `organizationId`, `name`, `address`, `phone`, `hours`
2. **שדה ב-User** — `primaryLocationId`
3. **שדה ב-TherapySession** — `locationId`
4. **שדה ב-Client** — `preferredLocationId` (לא חובה)
5. **UI** — `/clinic-admin/locations`
6. **דוחות per-location** — הכנסה, עומס, מטופלים

**שיקולי אבטחה:**
- isolation בין סניפים: האם מטפל בסניף A יכול לראות תיקי סניף B? (בד"כ כן, אבל אופציה לסגור)
- migration: כל ה-sessions/clients הקיימים צריכים `locationId=null` כברירת מחדל

---

### G3 — פיצול הכנסות בין מטפלים
**גודל:** M (2-3 קומיטים)

**מה זה?** מטפלת מקבלת 70% מההכנסה שלה, הקליניקה 30%. צריך לחשב אוטומטית לכל פגישה ולהציג דוח חודשי.

**מה צריך לבנות:**
1. **שדה ב-User** — `revenueSharePct` (Decimal 0-100, default 100)
2. **שדה ב-Organization** — `defaultRevenueSharePct`
3. **שדה ב-TherapySession** — `therapistRevenueIls` (snapshot בזמן תשלום)
4. **API** — `/api/clinic-admin/revenue-report?month=YYYY-MM`
5. **UI** — דוח חודשי per-therapist
6. **integration עם Payment** — בעת תשלום, חישוב אוטומטי

---

### G4 — דוחות קופות חולים ברמת ארגון
**גודל:** M

**מה זה?** היום דוח קופות חולים הוא per-session. הקליניקה רוצה דוח חודשי כולל לכל המטפלות יחד.

**מה צריך לבנות:**
1. **API** — `/api/clinic-admin/insurer-batch?month=YYYY-MM&insurer=CLALIT`
2. **PDF batch** — מאגד את כל הפגישות של אותה קופה
3. **UI** — `/clinic-admin/reports/insurer`

---

### G5 — Dashboard עומס מטפלים
**גודל:** M

**מה זה?** הבעלים רוצה לראות בכמה מטופלים מטפל כל אחד, כמה פגישות בשבוע, כמה הכנסה — בכרטיס מהיר.

**מה צריך לבנות:**
1. **API** — `/api/clinic-admin/caseload-summary`
2. **UI** — `/clinic-admin/caseload`:
   - כרטיס per-therapist: מטופלים פעילים, פגישות השבוע, ממוצע שעות
   - sort by overload (להתריע על מטפלים שעובדים יותר מדי)

---

### G6 — Waitlist + דף הזמנה ציבורי
**גודל:** XL (5-6 קומיטים)

**מה זה?** קליניקה רוצה דף נחיתה ציבורי שבו מטופל פוטנציאלי משאיר פרטים, וגם רשימת המתנה מסודרת.

**מה צריך לבנות:**
1. **מודל חדש** — `WaitlistEntry`
2. **דף ציבורי** — `/c/[clinicSlug]` (Server Component, public)
3. **טופס** — שם, טלפון, תחום, שעות מועדפות
4. **API** ציבורי עם rate limiting אגרסיבי + CAPTCHA
5. **UI לבעלים** — `/clinic-admin/waitlist` — קבלה, השמה למטפלת, סגירה
6. **SEO** — meta tags, OpenGraph

**אזהרות:**
- API ציבורי = surface אבטחה גדול
- חובה rate limiting + ספאם detection
- אסור לחשוף מספרי טלפון או רשימת מטפלים בדף ציבורי

---

### G7 — Compliance Vault (תיוק רגולטורי)
**גודל:** L

**מה זה?** כל הרישיונות, הסכמי סודיות, ביטוחים, חוזי שכירות של הקליניקה במקום אחד עם תזכורות לחידוש.

**מה צריך לבנות:**
1. **מודל חדש** — `ComplianceDocument`:
   - `organizationId`, `type` (LICENSE / INSURANCE / NDA / OTHER)
   - `fileUrl`, `expiresAt`, `linkedUserId?`
2. **UI** — `/clinic-admin/compliance`
3. **Cron** — תזכורת 30/14/7 ימים לפני expiresAt

---

### G8 — חשבונית ישראל (רגולטורי)
**גודל:** XL (5-6 קומיטים) — **רגיש רגולטורית**

**מה זה?** לפי חוק חשבונית ישראל החדש (2024+), חשבוניות מעל 5,000 ש"ח חייבות אישור CRM ממס הכנסה. צריך integration עם API של מס הכנסה.

**מה צריך לבנות:**
1. **Integration עם רשות המסים** — שירות חיצוני
2. **שדה ב-Receipt** — `israelInvoiceCrmId`
3. **דחיית קבלות** מעל הסף אם לא קיבלנו אישור CRM
4. **תיעוד מלא** + audit log

**אזהרה:** משימה רגישה חוקית. **לא לעשות בלי לוודא עם המשתמש פעמיים שהוא רוצה את זה עכשיו ושיש לו אישורים מספיקים מרשות המסים.**

---

### G9 — הענקת גישה per-client
**גודל:** L

**מה זה?** "אני רוצה ששרה תוכל לראות את המטופלים שלי כשאני בחופש — אבל רק את שרה ורק את 3 המטופלים האלה". גישה זמנית מבוקרת.

**מה צריך לבנות:**
1. **מודל חדש** — `ClientAccessGrant`:
   - `clientId`, `granteeUserId`, `granterUserId`
   - `permissions` (VIEW / EDIT / SESSIONS)
   - `expiresAt`
2. **scope updates** — `buildClientWhere` צריך לקחת בחשבון grants
3. **UI** — לכל לקוח, "שתף גישה זמנית"
4. **audit** — חובה לוג של כל view במצב משותף

**אזהרה:** משפיע על scope כמעט בכל endpoint. דורש בדיקה זהירה של רגרסיות.

---

### G10 — Audit log פתוח למטופל (תיקון 13)
**גודל:** M

**מה זה?** לפי תיקון 13 לחוק הגנת הפרטיות, המטופל זכאי לראות מי ניגש לתיק שלו ומתי. צריך UI שמציג את זה.

**מה צריך לבנות:**
1. **API** — `/api/client/[id]/access-log` (רק למטופל עצמו דרך magic link)
2. **UI ציבורי** — `/p/client/[token]/access-log`
3. **filtering** — רק access events רלוונטיים (לא מטא-דאטה פנימית)

---

### G11 — Shared inbox + WhatsApp
**גודל:** XL

**מה זה?** המזכירה רואה את כל ההודעות שמגיעות לקליניקה (WhatsApp, SMS, email) במסך אחד ויכולה לענות בשם כל מטפל.

**מה צריך לבנות:**
1. **WhatsApp Business API** integration (חיצוני, יקר)
2. **מודל חדש** — `InboxMessage`
3. **UI** — `/clinic-admin/inbox`
4. **assignment** — הודעות לפי מטפל

**אזהרה:** integration חיצוני יקר ומורכב. **דורש אישור מהמשתמש שהוא רוצה לשלם ל-Meta על WhatsApp Business** לפני התחלת פיתוח.

---

### G12 — קישור חשבונות משפחה
**גודל:** L

**מה זה?** "אמא + 3 ילדים, כולם מטופלים שלי. אני רוצה לראות אותם כקבוצה אחת, לחייב חיוב אחד, ולעקוב אחרי הפגישות יחד".

**מה צריך לבנות:**
1. **מודל חדש** — `ClientFamily`:
   - `name` (שם המשפחה)
   - `primaryContactId` (אחד מהם)
2. **שדה ב-Client** — `familyId?`
3. **UI** — קישור/ניתוק מהמשפחה
4. **חיוב** — אופציה לחיוב מאוחד
5. **report** — דוח per-family

---

## חלק 4: סדר עבודה מומלץ

1. **E3 (גדול אבל קריטי)** — לולאת התשלום של הקליניקה חייבת להיסגר
2. **G5 (קטן, ROI גבוה)** — Dashboard עומס — שיפור UX מיידי
3. **G3 (קטן)** — פיצול הכנסות — בקשה נפוצה
4. **G9 (בינוני)** — גישה per-client — צורך אבטחה
5. **G10 (בינוני)** — Audit למטופל — דרישה רגולטורית
6. **G1 (גדול)** — פיקוח קליני — feature מקצועי חשוב
7. **G2 (גדול)** — סניפים — feature אבל לא דחוף
8. **G4 (בינוני)** — דוחות קופ"ח batch
9. **G7 (בינוני)** — Compliance vault
10. **G12 (בינוני)** — משפחות
11. **G6 (גדול, סיכון)** — booking ציבורי — לא לעשות בלי דיון מעמיק
12. **G8 (רגיש)** — חשבונית ישראל — לא לעשות בלי אישור מפורש
13. **G11 (יקר)** — WhatsApp — לא לעשות בלי אישור מפורש

---

## חלק 5: דברים שלא לעשות

- ❌ אל תיגע ב-`HANDOFF-phase4-clinic-ownership-ui.md` או `HANDOFF-health-fund.md` — אלה צ'אטים אחרים.
- ❌ אל תיגע ב-`src/app/clinic-admin/layout.tsx`, `transfer/page.tsx`, `clients-by-therapist/` — צ'אט אחר עובד עליהם.
- ❌ אל תרץ `prisma migrate deploy` בלי לבדוק שאין migrations נוספים שלא ראית.
- ❌ אל תוסיף `console.log`. תמיד `logger.info/warn/error`.
- ❌ אל תשנה את `auth.ts` בלי תשומת לב מיוחדת (Stage 1.17 בעבודה).

---

## חלק 6: דברים שעוזרים לעבוד מהר

- בכל משימה, התחל מ-Read של הקובץ הראשי המעורב + Read של הסכמה הרלוונטית.
- `npm test` רץ ב-~8 שניות אם רק טסטים שלך השתנו.
- `npx tsc --noEmit` רץ ב-~40 שניות — לא לדחוף בלי שזה ירוץ נקי.
- אם סוכן מחזיר RED — תמיד תיקון לפני המשך, גם אם נראה לך שהוא טועה. בדוק קודם.

---

## חלק 7: צ'אט-לוג קצר ממה שעשיתי

ב-Phase E+F הזה (3 קומיטים):
- E1 — `User.aiTierBeforeClinic` + ירושת מסלול AI מהקליניקה (16 unit tests)
- E2 — `custom-contract-renewals` cron + alerts (16 unit tests)
- F1 — UI פולישינג של דף ההזמנה (PLAN_NAMES + attemptsRemaining + inheritedAiTier)

סה"כ 692 tests passing, 36 test files, אפס שגיאות tsc/eslint.

קומיטים על main:
- `6be75aac` M11.E1
- `22094731` M11.E2
- `eda0b604` M11.F1

הצ'אט הבא ממשיך מ-E3 או מ-G5 (לפי בחירת המשתמש).

---

**בהצלחה. תזכור: 5 סוכנים, GREEN לפני commit, push מיד אחרי.**
