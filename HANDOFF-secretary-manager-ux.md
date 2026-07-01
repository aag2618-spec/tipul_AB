# HANDOFF — חוויית מזכירה ומנהלת לא-מטפלת (להמשך בצ'אט חדש)

> קובץ זה מיועד לצ'אט חדש שימשיך את העבודה. קרא אותו **במלואו** לפני שתתחיל.
> תאריך: 2026-06-01. נכתב ע"י הצ'אט שביצע את שלב 1.

---

## 0. מי המשתמש ואיך לעבוד איתו (קרא ראשון!)
- המשתמש הוא **מטפל, לא מתכנת** → הסברים בעברית פשוטה, לשון זכר.
- **תקשורת בעברית בלבד.** לא לערבב אנגלית בתוך משפט עברי (שמות קבצים/מונחים — בשורה נפרדת או כקישור).
- כל טקסט שהמשתמש רואה ב-UI חייב להיות **בעברית** (RTL, פונט Heebo).
- האתר (MyTipul) לקהל **חרדי/דתי** — בלי תוכן זוגיות.
- **כל הכללים המלאים בזיכרון הגלובלי** — קרא את `MEMORY.md` ואת קובצי ה-feedback. הכי חשובים מסוכמים בסעיף 6 כאן.

---

## 1. ההקשר — מה הפרויקט הזה
המערכת (T3 Stack: Next.js App Router, TypeScript, Prisma, PostgreSQL, RTL עברית) נבנתה
סביב **מטפל יחיד**. כשנכנסת **מזכירה** או **מנהלת-שאינה-מטפלת**, היא מקבלת את אותו
דשבורד של מטפל — לא מותאם לה. המטרה: **מסך כניסה מותאם לכל תפקיד** + יומן שמתפקד
טוב עם הרבה מטפלים.

**התוכנית המלאה:** `C:\Users\User\.claude\plans\snug-frolicking-toast.md`
**זיכרון הפרויקט:** קובץ הזיכרון `project_secretary_manager_ux.md` (+ `project_team_chat.md`).

---

## 2. מה כבר הושלם ונדחף ל-main (אל תחזור על זה)

### שלב 1 — יומן רב-מטפלים (commit `ac524e5f`, 2026-06-01)
- שם המטפל מוחזר ב-`/api/sessions/calendar` (id+name) ומחובר עד תצוגת האירוע.
- מסנן לפי מטפל ב-`calendar/page.tsx` (dropdown), נטען מ-`/api/clinic/therapists` הקיים.
- צבע יציב לכל מטפל (`getTherapistAccent` ב-`src/lib/calendar/event-colors.ts`) + שם מטפל על כל פגישה.
- מוצג **רק** בקליניקה עם >1 מטפל. מטפל עצמאי — אפס שינוי.
- **תיקון אבטחה (היה קיים מראש):** מסלול המזכירה ב-calendar route דלף `topic`/`notes` (תוכן קליני).
  נוסף post-filter שמשמיט אותם לכל מזכירה.

### צ'אט צוות שלב 1 (commit `14d51e46`)
מנהלת↔מזכירות + ערוץ "כל הצוות", polling, תג לא-נקראות. (שלבים 2-3 שלו ממתינים — ראה סעיף 5.)

---

## 3. ממצאי מפתח על המערכת (מאומתים בקוד — אל תחקור מחדש)
- **נחיתה אחרי login:** כל התפקידים נוחתים על `/dashboard` (hardcoded ב-`src/app/(auth)/login/page.tsx:89`).
  אין redirect לפי תפקיד. **אין `middleware.ts`** — ההגנות ב-`src/proxy.ts`.
- **אין דשבורד נפרד לפי תפקיד.** מזכירה ומנהלת מקבלות את **דשבורד המטפל** עם נתוני כל הקליניקה
  (scope של OWNER/SECRETARY = כל הארגון, `src/lib/scope.ts`), ותוכן קליני מוסתר. יש להן פריטים
  מתים בתפריט (ממתינים לסיכום ריק, כלים קליניים חסומים, דוחות חסום ללא canViewStats).
- **היומן:** `buildSessionWhere` ל-OWNER/SECRETARY = כל פגישות הארגון (כל המטפלים יחד).
- **"הקליניקה שלי"** בסרגל הראשי (`src/components/app-sidebar.tsx`) = `isClinicOwner` בלבד (לא מזכירה).
  מזכירה עם `canTransferClient` מגיעה ל-`/clinic-admin` רק דרך deep-links נסתרים (אין קישור גלוי).
- **`ownerIsTherapist`** (על `Organization`) = שדה הצהרתי בלבד, **לא** משפיע על UI/scope כיום.
- **helpers קיימים לשימוש חוזר:** `isSecretary`, `isClinicOwner`, `loadScopeUser`, `buildSessionWhere`,
  `buildClientWhere`, `buildPaymentWhere`, `secretaryCan`, `getClientSafeSelectForSecretary` (כולם ב-`src/lib/scope.ts`).
  `useMyPermissions` (`src/hooks/use-my-permissions.ts`). `/api/clinic/therapists` (רשימת מטפלי הקליניקה).

---

## 4. מה נותר לעשות — שלבים 2-3 (העבודה העיקרית להמשך)

### שלב 2 — מסך front-desk למזכירה + ניקוי ניווט
**מטרה:** מזכירה תקבל מסך מותאם במקום דשבורד המטפל.

**2א. מסך front-desk (נחיתה מותאמת):**
- ב-`src/app/(dashboard)/dashboard/page.tsx` (Server Component) — הסתעפות:
  `if (isSecretary(scopeUser)) return <SecretaryHome ... />`. שאר התפקידים — ללא שינוי.
- רכיב חדש `src/components/dashboard/secretary-home.tsx` שמציג:
  1. **פגישות היום של כל הקליניקה** (כל המטפלים) — שם מטופל, שעה, מטפל, סטטוס. **בלי** תוכן קליני.
  2. **"מה דורש טיפול" (חריגים):** פגישות ללא תשלום (אם `canViewPayments`), בקשות ביטול,
     תזכורות לשליחה (אם `canSendReminders`).
  3. **פעולות מהירות** לפי הרשאות: "מטופל חדש" (`canCreateClient`), "פגישה חדשה", מעבר ליומן.
- שימוש חוזר בבוני-הנתונים הקיימים (`buildSessionWhere`, `buildPaymentWhere`, `payment-utils.ts`).
  כותרות בעברית, **בלי** "הפעילות שלך" (אין לה פעילות אישית).

**2ב. ניקוי תפריט הצד למזכירה (`src/components/app-sidebar.tsx`):**
- להסתיר ממזכירה: "ממתינים לסיכום" (תמיד ריק), קבוצת "כלים קליניים" (חסומה),
  "דוחות" (אלא אם `canViewStats`), "הגדרות AI".
- להשאיר: דשבורד(front-desk), יומן, מטופלים, תשלומים/הודעות (לפי הרשאה), **צ'אט צוות**, תמיכה.
- הסינון לפי `clinicRole==="SECRETARY"` + הרשאות מ-`useMyPermissions`.

### שלב 3 — מנהלת לא-מטפלת: נחיתה ניהולית + צ'אט בניהול
**מטרה:** מנהלת שאינה מטפלת תנחת ב"בית" שלה (ניהול הקליניקה).

**3א. זיהוי:** להוסיף `ownerIsTherapist` (מ-`Organization`) ל-`loadScopeUser` (`src/lib/scope.ts`, join קל),
  או helper נפרד. הגדרה: `isClinicOwner(scopeUser) && ownerIsTherapist === false`.

**3ב. נחיתה מותאמת:** ב-`dashboard/page.tsx`: אם מנהלת-לא-מטפלת → `redirect("/clinic-admin")`.
  (מנהלת שכן מטפלת ומטפל עצמאי — ללא שינוי.) **תלוי** בכך ש-`ownerIsTherapist` מוגדר נכון לקליניקה.

**3ג. העשרת `/clinic-admin` ל-KPIs ניהוליים:** ב-`src/app/clinic-admin/page.tsx` /
  `src/app/api/clinic-admin/overview/route.ts` — להוסיף לכרטיסים הקיימים (צוות/תמחור/SMS):
  פגישות היום בקליניקה, no-shows החודש, סך חובות פתוחים, ממתינים לסיכום (דרך scope של כל הארגון).

**3ד. כניסה לצ'אט מתוך ניהול הקליניקה:** ב-`src/app/clinic-admin/layout.tsx` — להוסיף ל-`navItems`
  פריט "צ'אט צוות" (`href: /dashboard/team-chat`, אייקון `MessagesSquare`, `secretaryWithTransfer: true`),
  **רצוי עם תג לא-נקראות** (polling ל-`/api/chat/unread-count`, כמו ב-`app-sidebar.tsx`).

**3ה. קישור מוגבל למזכירה (החלטת המשתמש):** מזכירה עם `canTransferClient` תקבל **קישור גלוי מוגבל**
  ל-clinic-admin (רק לפונקציות שמותרות לה — "העברת מטופל" / "מטופלים לפי מטפל"), במקום deep-links נסתרים.
  הסקירה המלאה (כסף/חיוב/חוזים) **נשארת לבעלים בלבד**. מזכירה רגילה — בלי קישור.

---

## 5. עבודה משנית שממתינה — צ'אט צוות שלבים 2-3 (ראה `project_team_chat`)
- **שלב 2:** קישור מטופל מכובד-הרשאות (`clientId` — קיים בסכמה, מנוטרל; להשתמש ב-`buildClientWhere`),
  "הודעה חשובה" של מנהלת (`isAnnouncement`), עריכה/מחיקה רכה (`editedAt`/`deletedAt`). **רגיש PHI** — TDD.
- **שלב 3:** התראות אימייל בכיבוד שבת (reuse `@/lib/shabbat` `isShabbatOrYomTov`), חיפוש, השתקה (`isMuted`).
- **חוב טכני:** `leftAt` ב-`ChatParticipant` לא נכתב — מזכירה שעוזבת נשארת "רפאים" ברשימת המשתתפים. לתקן בעת הסרת חבר/חסימה.

---

## 6. הכללים המחייבים (חובה לפעול לפיהם — מתוך הזיכרון הגלובלי)

**לפני כל משימה:**
1. למפות את כל הקבצים הקשורים (Explore/grep) — מי צורך את מה שמשנים (גזע וענפים). לקרוא לפני לערוך.
2. לחשוב על כל המערכת (API, hooks, types, קומפוננטות) — לא רק על הנקודה הספציפית.
3. לבדוק גם UI/דיאלוגים, לא רק לוגיקה.

**בזמן העבודה:**
4. **שינוי אחד בכל פעם**, commit נפרד עם הודעה ברורה בעברית.
5. לא לגעת בקבצים שלא ביקשו — אם רואים משהו, להציע ולחכות לאישור.
6. כל טקסט למשתמש בעברית (RTL). `&quot;` / גרש עברי `׳` (U+05F3) ב-JSX (אחרת ESLint נכשל — ראה `reference_jsx_quot_entities`).

**כללי קוד (T3):**
7. API routes — `export const dynamic = "force-dynamic"`. Prisma Decimal → `Number(x) || 0`. תאריכים — null-check לפני format.
8. Auth — `requireAuth()` ב-API. **`logger` בלבד**, אף פעם לא `console.*` (דליפת PII).
9. **אבטחה (PHI!):** המערכת מאחסנת מידע רפואי סודי. בידוד לפי `organizationId` בכל שאילתה. מזכירה לא רואה
   תוכן קליני (`CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY` ב-scope.ts). זהירות מ-`include` ב-Prisma שמחזיר את כל ה-scalars.

**לשינויים קריטיים** (הלכה/כסף/זמנים/PHI/בלתי-הפיך): TDD (טסטים לפני קוד) + ביקורת. ראה `feedback_critical_changes_process`.

**לפני כל פוש (חובה — `feedback_pre_push`):**
10. להריץ `npx tsc --noEmit` (נקי) + `npx vitest run` + `npx eslint <files>`.
11. **לשלוח 5 סוכנים מקבילים** (תקינות קוד · סנכרון מערכת · UX · אבטחה/הרשאות · ביצועים/קצוות)
    **+ 2 סוכני אבטחה** (סייבר/דליפת PHI · תקינות-אבטחה). **לולאה הלוך-חזור עד שכולם ✅**, ואז **פוש אוטומטי בלי לבקש אישור**.
12. **git:** עבודה ישירה על `main`. **אסור `git add .`** — רק שמות קבצים מפורשים. לפני commit: `git diff --cached --stat` לוודא שרק הקבצים שלך.

---

## 7. ⚠️ אזהרה — צ'אטים מקבילים פעילים
- יש כרגע (2026-06-01) **צ'אט מקביל** שעובד על פיצ'ר **"קישורי זימון" (booking links)** —
  נתיבים `/booking/t/[token]`. הוא שינה: `prisma/schema.prisma`, `src/lib/rate-limit.ts`,
  `src/lib/validations/booking.ts`, `src/lib/clinic-invitations.ts`, קבצי `api/booking/*`, `app/booking/t/*`,
  `src/lib/booking-core.ts`, `src/lib/booking-links.ts`. **אסור לגעת בקבצים האלה.**
- **בעת commit** — להוסיף **רק** את הקבצים שלך לפי שם. לבדוק `git status` ולא לערבב.
- **`next build` מקומי** עלול להיכשל אם שרת dev של צ'אט מקביל רץ (פורט 3000, תופס את `.next`).
  **לא להרוג** את התהליך. אם build נכשל מסיבה זו — לאמת דרך tsc + vitest + סוכן מוכנוּת-build, ולציין למשתמש.
  פריסת Render מריצה build משלה ממילא (כשל build שם = הפריסה לא עולה, בלי נזק לפרודקשן).

---

## 8. אימות מקצה לקצה (לכל שלב)
1. **חשבונות:** מזכירה + מנהלת-לא-מטפלת (`ownerIsTherapist=false`) + מטפל עצמאי (בקרת רגרסיה).
2. כניסת מזכירה → front-desk; כניסת מנהלת → ניהול; יומן עם 2+ מטפלים (מסנן/צבע/שם).
3. מזכירה לא רואה תוכן קליני; בידוד ארגוני נשמר; מטפל עצמאי ללא שינוי.
4. `tsc` נקי · `vitest` · (`next build` אם אפשר) · לולאת 5+2 סוכנים → פוש.

---

**בהצלחה. התחל משלב 2 (מסך front-desk למזכירה) אלא אם המשתמש מבקש אחרת.**
