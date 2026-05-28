# HANDOFF — Next Session: G3 פיצול הכנסות

> מסמך מיני-Handoff המופנה לצ'אט שממשיך את עבודת **M11** אחרי הסשן של 2026-05-28
> בו G5 (Dashboard עומס מטפלים) נסגר. הצ'אט הבא קורא את המסמך הזה **ראשון**
> ואחר כך משלים פרטים מ-`HANDOFF-M11-remaining.md` (המסמך הראשי).

---

## חלק 1: מצב נוכחי (2026-05-28, סוף יום)

### הקומיטים האחרונים על `main`
- `5b7e5e05` תיעוד: עדכון HANDOFF M11 — סימון G5 כהושלם
- `6cd07540` security: force-dynamic ב-8 דפי dashboard עם PHI (צ'אט אחר)
- `065c47f0` **M11.G5**: דוח עומס מטפלים לבעלי קליניקה
- `afcfa76d` fix(reports): force-dynamic + a11y לטוגל (צ'אט אחר)
- `f9a12449` תיעוד: HANDOFF M11 — מה שנשאר (E3 + G1-G12) + כללי עבודה
- `c5c56b8d` feat(reports): toggle הכנסות (צ'אט אחר)

### מה שעבד ובדוק
- 707 tests passing, 37 test files (כולל `caseload.test.ts` החדש עם 19 בדיקות)
- `npx tsc --noEmit` — 0 שגיאות
- `npx eslint` על קבצי G5 — 0 errors/warnings
- working tree נקי לחלוטין (אין `M`/`A`/`D` חדשים מעבר ל-untracked של `.pipeline-*` ו-HANDOFF docs)

### מה כבר נגיש בקליניקה
- `/clinic-admin/caseload` — דוח עומס מטפלים (חדש, G5)
- כניסה לדוח דרך כרטיס "הרכב הצוות" בדף הסקירה (`/clinic-admin`)
- ה-route לא נוסף ל-sidebar (`layout.tsx`) — לפי בקשת ה-HANDOFF הראשי שלא לגעת בו

---

## חלק 2: חוקי עבודה — חובה לקרוא

**אל תדלג על זה** — תקציר של `HANDOFF-M11-remaining.md` חלק 1. בכל ספק — חזור למסמך הראשי.

1. **סקופ קבצים strict**: רק קבצים שהמשתמש ביקש או שנחוצים-במישרין למשימה. אם נראה שצריך לגעת בקובץ מחוץ לסקופ — **עצור, ספר למשתמש, ובקש אישור** לפני נגיעה. אסור `git add .` או `git add -A`.
2. **5 סוכנים במקביל לפני כל commit** — Security / Backward-compat / Multi-tenancy / UX / Build pipeline. חכה ל-GREEN בכולם. YELLOW/RED → תקן והרץ שוב את אותו סוכן בלולאה עד GREEN.
3. **שמירת תאימות לאחור**: אסור לשבור זרימות קיימות. אם תיקון אבטחה דורש שבירה — אישור מפורש מהמשתמש לפני יישום. מתפלים עצמאיים (`organizationId=null`) — חובה התנהגות זהה לחלוטין.
4. **PowerShell**: `;` במקום `&&`. הודעות commit דרך קובץ זמני (`git commit -F .commit-msg-XX.txt` + `Remove-Item`), לא heredoc.
5. **push אוטומטי** מיד אחרי commit מוצלח (אלא אם המשתמש כתב "אל תדחוף"). אסור `git commit --amend` על commit שכבר נדחף.
6. **קונבנציות פרויקט**: כל UI עברית RTL · תאריכים `he-IL` + `Asia/Jerusalem` · `Prisma Decimal` → `Number(value) || 0` לפני JSX/JSON · בכל API route `export const dynamic = "force-dynamic"` · `import { logger } from "@/lib/logger"` (לא console) · queries בתוך try-catch עם `logger.error`.
7. **לא לגעת** ב: `src/app/clinic-admin/layout.tsx`, `transfer/page.tsx`, `clients-by-therapist/`, `HANDOFF-phase4-*`, `HANDOFF-health-fund.md`, ובכל קובץ שמופיע ב-`git status` כ-`M` מצ'אט אחר.
8. **לא לרוץ `prisma migrate deploy`** בלי לבדוק שאין migrations של צ'אט אחר. לא לשנות `auth.ts` בלי תשומת לב מיוחדת.

---

## חלק 3: המשימה הבאה — G3 פיצול הכנסות (M, 2 קומיטים)

### הבעיה העסקית
מטפלת מקבלת אחוז מההכנסה של פגישות שלה (למשל 70%) והקליניקה לוקחת את היתרה (30%). היום אין מנגנון כזה במערכת — כל פגישה "שייכת" 100% למטפלת. הבעלים רוצים דוח חודשי שמראה כמה כסף נכנס לקליניקה וכמה הולך לכל מטפלת.

### למה זה דורש זהירות
- **מיגרציה ל-Prisma** עם 3 שדות חדשים — כל טעות יכולה לשבור deploys.
- **שילוב בזרימת Payment הקיימת** ליצירת snapshot של revenue share בעת חיוב — אם נכשל, יישברו תשלומים.
- **UI להגדרת אחוז פר-מטפל** — מחייב או נגיעה ב-`members/page.tsx` (סקופ של צ'אט אחר אם פעיל) או דף הגדרות חדש.

### תוכנית עבודה מומלצת — שני קומיטים

#### קומיט A (בטוח): Schema + Helper + Report API + Report UI (בלי snapshot, בלי settings UI)
1. **מיגרציה** ב-`prisma/migrations/<timestamp>_add_revenue_share/migration.sql`:
   ```sql
   -- M11.G3: revenue share per therapist + org default.
   -- idempotent (IF NOT EXISTS) — בטוח לכשל פריסה חוזרת.
   ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "revenueSharePct" DECIMAL(5,2);
   ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "defaultRevenueSharePct" DECIMAL(5,2);
   ```
   - **אל תוסיף** `therapistRevenueIls` ל-TherapySession בקומיט הזה — זה לקומיט B.
   - שדות nullable ללא DEFAULT — אין צורך ב-backfill. ב-helper מטפלים ב-null:
     - `User.revenueSharePct = null` → יורש מ-`Organization.defaultRevenueSharePct`
     - `Organization.defaultRevenueSharePct = null` → 100% (ברירת מחדל אחרונה)

2. **עדכן `prisma/schema.prisma`** — הוסף בהתאם:
   ```prisma
   // ב-User:
   revenueSharePct Decimal? @db.Decimal(5, 2) // 0-100; null = יורש מ-Organization

   // ב-Organization:
   defaultRevenueSharePct Decimal? @db.Decimal(5, 2) // 0-100; null = 100 (default)
   ```

3. **Pure helper** ב-`src/lib/clinic/revenue-share.ts`:
   ```ts
   export function resolveRevenueSharePct(args: {
     userPct: number | null | undefined;
     orgDefaultPct: number | null | undefined;
   }): number { /* user → org → 100 fallback */ }

   export function computeMonthlyRevenueReport(input: {
     therapists: Array<{ id: string; name: string | null; email: string; revenueSharePct: number | null }>;
     orgDefaultPct: number | null;
     payments: Array<{ amount: number; paidAt: Date; therapistId: string }>;
     monthStartIL: Date;
     monthEndIL: Date;
   }): Array<{
     therapistId: string;
     name: string | null;
     email: string;
     sharePct: number;
     totalPaidIls: number;
     therapistRevenueIls: number;
     clinicRevenueIls: number;
   }>
   ```

4. **בדיקות יחידה** ב-`src/lib/clinic/__tests__/revenue-share.test.ts` (כמודל ל-`caseload.test.ts`). ~15-20 בדיקות.

5. **API**: `GET /api/clinic-admin/revenue-report?month=YYYY-MM`:
   - `requireClinicOwner()` + `force-dynamic`
   - validate month param (regex `/^\d{4}-\d{2}$/`)
   - month boundaries לפי Asia/Jerusalem (השתמש ב-`getIsraelMidnight` + ידנית להגדרת תחילת/סוף חודש)
   - **קריטי — tenant binding**: `const { organizationId } = auth;` ושימוש ב-`organizationId` הזה **בלבד** בכל query. אין parameter חיצוני שבוחר ארגון.
   - שלוש queries מקבילות:
     ```ts
     prisma.organization.findUnique({
       where: { id: organizationId },
       select: { defaultRevenueSharePct: true },
     });
     prisma.user.findMany({
       where: { organizationId, clinicRole: "THERAPIST", isBlocked: false },
       select: { id: true, name: true, email: true, revenueSharePct: true },
     });
     // העתק את דפוס ה-AND/OR מ-`src/app/api/payments/monthly-total/route.ts`
     // (שורות 28-47) — הוא כבר מטפל בכל המקרים הקצה.
     prisma.payment.findMany({
       where: {
         AND: [
           {
             organizationId,              // defense-in-depth (Payment כולל indexed organizationId)
             session: { isNot: null },    // דלג תשלומים בלי session (אין therapistId)
           },
           EXCLUDE_BULK_UMBRELLA_WHERE,   // מ-src/lib/payments/types.ts — דלג על parent של bulk
           {
             status: "PAID",              // ⚠ הסטטוס האמיתי הוא PAID, לא COMPLETED
             // קריטי: דלג על parent של תשלום מפוצל (יש לו children) — נספר את ה-children בלבד.
             OR: [
               { parentPaymentId: { not: null } },
               { parentPaymentId: null, childPayments: { none: {} } },
             ],
           },
           {
             paidAt: { gte: monthStartUtc, lt: monthEndUtc },
           },
         ],
       },
       select: {
         amount: true,
         paidAt: true,
         session: { select: { therapistId: true } },
       },
     });
     ```
   - חישוב דרך ה-helper (יקבל therapists + orgDefault + payments), החזרה כ-`JSON.parse(JSON.stringify(...))`.
   - **אזהרה — חובה לעיין לפני יישום**: `src/app/api/payments/monthly-total/route.ts` שורות 28-47 + `src/lib/payments/types.ts` (חפש `EXCLUDE_BULK_UMBRELLA_WHERE`). הם מטפלים בשני סוגי כפילויות: bulk umbrella + parent-of-split. אם תפספס את ה-`OR` של parentPaymentId — תשלום מפוצל יספר פעמיים (פעם על ה-parent + פעם על ה-children).

6. **UI**: `/clinic-admin/revenue/page.tsx` — דף client component:
   - בורר חודש (input type=month)
   - טבלת מטפלים עם sharePct/totalPaidIls/therapistRevenueIls/clinicRevenueIls
   - כרטיסי סיכום סה"כ
   - empty/loading/error states (תבנית `caseload/page.tsx`)
   - **a11y**: `role="status"` + sr-only loader

7. **כניסה מדף הסקירה** (`src/app/clinic-admin/page.tsx`) — הוסף כפתור חדש בכרטיס "תמחור חודשי" או צור כרטיס נוסף "פיצול הכנסות". **לא לגעת ב-`layout.tsx`**.

#### קומיט B (אחרי שאישרת שקומיט A יציב):
- שדה `TherapySession.therapistRevenueIls` (snapshot בעת תשלום)
- שילוב ב-Payment creation flows (ראה `src/lib/payments/*`)
- **קריטי — מתפלים עצמאיים**: בכל שינוי ב-payment flow חובה `if (!organizationId) { /* skip snapshot, התנהגות זהה לחלוטין */ }`. אסור לשנות שום התנהגות למטפל עצמאי. הוסף בדיקה ייעודית.
- UI להגדרת `revenueSharePct` פר-מטפל (דף נפרד `/clinic-admin/revenue-settings`, **לא** members)
- ב-UI הגדרות — בנוסף שדה ל-`Organization.defaultRevenueSharePct`
- בדיקות integration:
  - OWNER של org A לא רואה payments של org B (mock או integration)
  - תשלום בלי session או של מטפל עצמאי לא נכלל
  - אחוז user → org → 100 fallback chain

---

## חלק 4: קבצים חשובים להכיר לפני שמתחילים

### תבניות לחיקוי (סופי לכתיבת G3)
- `src/app/api/clinic-admin/caseload-summary/route.ts` — דפוס route עם `requireClinicOwner` + Promise.all + JSON.parse(JSON.stringify(...))
- `src/lib/clinic/caseload.ts` — דפוס helper pure
- `src/lib/clinic/__tests__/caseload.test.ts` — דפוס בדיקות
- `src/app/clinic-admin/caseload/page.tsx` — דפוס client component עם loading/error/empty
- `src/lib/date-utils.ts` — `getIsraelMidnight`, `getIsraelMonth`, `getIsraelYear` לגבולות חודש
- `src/lib/clinic/require-clinic-owner.ts` — gate משותף

### Schema-related
- `prisma/schema.prisma` — חפש את `model User`, `model Organization`, `model TherapySession`, `model Payment`
- `prisma/migrations/20260528110000_add_user_ai_tier_before_clinic/migration.sql` — דוגמה למיגרציה idempotent קצרה

### Payment flow + סינונים (לקומיט A ול-B)
- `src/app/api/payments/monthly-total/route.ts` — דוגמה לסינון תקין של תשלומים מצטברים (parent/child + bulk umbrella). שורות 28-47 — **חובה לעיין ב-A**.
- `src/lib/payments/types.ts` — חפש `EXCLUDE_BULK_UMBRELLA_WHERE`. השתמש בקבוע הזה ב-query של revenue-report.
- `src/app/api/payments/**/*.ts`
- `src/lib/payments/*.ts`
- `src/lib/payments/__tests__/*.test.ts`

---

## חלק 5: מלכודות שזיהיתי בסשן הקודם

1. **`layout.tsx` בקליניקה** — מסומן "אל תיגע" ב-HANDOFF הראשי. אם אתה חייב להוסיף route ל-sidebar, **שאל את המשתמש קודם**.
2. **`members/page.tsx`** — לפי git log, נמצא בשימוש פעיל ע"י "Phase 4" של צ'אט אחר. אם אתה רוצה להוסיף שם UI להגדרת אחוז, **שאל קודם**.
3. **Decimal handling** — `revenueSharePct` יחזור כ-`Prisma.Decimal`. חובה `Number(x) || 100` לפני שמעבירים ל-helper או ל-JSON.
4. **DST/Asia/Jerusalem** — boundaries של חודש חייבים להיות לפי IL, לא UTC. השתמש ב-`getIsraelMidnight`/`getIsraelMonth`. בדוק שגבולות החודש לא נופלים במעבר שעון.
5. **Payment בלי session** — נדיר אבל קיים. ה-API צריך לדלג עליהם (אין `therapistId`).
6. **PowerShell commit message**: `git commit -m "..."` לא עובד טוב עם עברית רב-שורתית. תמיד דרך קובץ זמני:
   ```powershell
   # Write לקובץ .commit-msg-G3a.txt
   git commit -F .commit-msg-G3a.txt
   Remove-Item .commit-msg-G3a.txt
   ```

---

## חלק 6: פקודות אימות מהירות (PowerShell)

```powershell
# בדוק שאתה ב-main מסונכרן
cd c:\Users\User\Documents\tipul_AB\tipul_AB-main
git status --short
git fetch; git log --oneline -5

# הרץ tsc + eslint על קבצים שיצרת בלבד
npx tsc --noEmit
npx eslint <נתיב1> <נתיב2> ...

# הרץ test רק על הסט החדש (מהיר)
npx vitest run src/lib/clinic/__tests__/revenue-share.test.ts --reporter=verbose

# הרץ test כולל
npm test -- --run

# stage רק קבצים מפורשים
git add <נתיב מפורש>
git status --short
```

---

## חלק 7: למה G3 ולא משהו אחר?

> **חשוב**: לסשן הזה, **G3 מחליף את E3 כעדיפות #1** של `HANDOFF-M11-remaining.md` חלק 4. למה — ראה למטה.

סדר עדיפויות עדכני:
1. ~~E3 (XL)~~ — מנוי קליניקה — **נדחה** בסשן הקודם כי דורש Cardcom integration רחבה ומיגרציה גדולה, ולא הגיוני כקומיט אחד. אם הצ'אט הבא מרגיש בטוח עם payment infrastructure ויש לו אישור מפורש מהמשתמש — אפשר לחזור ל-E3, אבל עדיף לחכות לסשן ייעודי לזה.
2. ~~G5 (M)~~ — ✅ נסגר ב-`065c47f0`
3. **G3 (M) — מומלץ ראשון לסשן הזה** — בקשה נפוצה, ROI גבוה, נכון לפצל ל-A/B כדי לא לשבור Payment flow.
4. G9 (M) — per-client access — **סקופ-מסוכן**, משפיע על endpoints רבים. עדיף לא ראשון.

**חלופה אם G3 מרגיש גדול מדי**: G4 (דוחות קופ"ח batch) — לא דורש מיגרציה כלל, רק API + UI על InsurerReport הקיים. תקרא חלק 3 ב-`HANDOFF-M11-remaining.md`.

---

## חלק 8: סיכום למשתמש (בשורה אחת)

> ✅ G5 בוצע ונדחף. הצ'אט הבא ממשיך מ-G3 (פיצול הכנסות) בשני קומיטים: A — schema+report (בטוח), B — snapshot+settings (אחרי A). פרטים מלאים פה. בהצלחה.

---

**הערה לצ'אט הבא**: אם משהו לא ברור, קרא את `HANDOFF-M11-remaining.md` חלק 3 (שורות 184-197 ל-G3). אם עדיין לא ברור — שאל את המשתמש לפני שאתה מתחיל לכתוב קוד.
