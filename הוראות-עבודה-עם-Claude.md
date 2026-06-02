# הוראות עבודה — הזכרון הגלובלי של Claude

> מסמך זה מרכז את כל ההוראות, ההעדפות והכללים השמורים בזכרון הגלובלי של Claude עבור פרויקט MyTipul.
>
> תאריך ייצוא: 2026-05-29

---

## חלק א׳ — פרופיל המשתמש

### מי המשתמש (user_role)
- **מטפל (תרפיסט)** שבנה מערכת ניהול קליניקה עם עזרת AI
- **גבר** — תמיד לפנות בלשון זכר (אתה/שלך/מאשר). לא "אתי/שלך/מאשרת"
- **לא מתכנת** — צריך הסברים פשוטים, בעברית, כמו "לילד בכיתה א"
- עובד עם כמה AI במקביל (Claude Code, Cursor עם Opus 4.6) ומשתמש בהם לביקורת הדדית
- מעדיף תקשורת בעברית
- רוצה מערכת מסודרת, נקייה, שקל לתחזק ולשפר
- לא רוצה שישברו דברים — מעדיף בדיקה יסודית לפני כל שינוי
- רוצה לראות ביקורת ותוכנית לפני שמאשר שינויים

### האתר חרדי — התאמת תוכן (user_haredi_site)
האתר MyTipul מיועד לקהל **חרדי/דתי**:
- לא לכלול תוכן על זוגיות (בדפי עבודה, בתחומי חיים וכו')
- במקום "זוגיות / מערכות יחסים" — להשתמש ב"חברויות" בלבד
- להתאים שפה ותוכן לקהל היעד

---

## חלק ב׳ — הוראות קוד טכניות (feedback_coding_standards)

**זה חובה לקרוא ראשון בכל שיחה.**

### Role & Context
Senior Full-Stack Developer specializing in the T3 Stack: Next.js (App Router), TypeScript, React, Prisma, PostgreSQL.

### תקני קוד מרכזיים
1. **Next.js (App Router):** Server Components כברירת מחדל; `'use client'` רק לאינטראקציה או hooks
2. **TypeScript:** type safety של 100%. להימנע מ-`any`. Interfaces לאובייקטים, Types לאיחודים
3. **Prisma:** תמיד לעיין ב-`prisma/schema.prisma` לפני שינויי DB
4. **Styling:** Tailwind CSS

### שפה וכיוון
- כל ה-UI בעברית (RTL)
- `dir="rtl"` איפה שצריך
- פורמט תאריכים: locale `he-IL`, timezone `Asia/Jerusalem`

### API Routes — חובה!
כל קובץ `src/app/api/**/route.ts` חייב:
```typescript
export const dynamic = "force-dynamic";
```
בלי זה Next.js יחזיר נתונים מ-cache.

### Prisma Decimal — מסוכן!
ערכי `Decimal` של Prisma לא עוברים serialization בטוח:
- **תמיד** להמיר עם `Number(value) || 0`
- בפונקציות שמעבירות נתונים לקומפוננטות:
  ```typescript
  return JSON.parse(JSON.stringify(data)) as typeof data;
  ```
- לעטוף את הפונקציה (כולל ה-Prisma query) ב-try-catch

### Date Fields — זהירות עם null
אחרי `JSON.parse(JSON.stringify())`, תאריכים הופכים ל-ISO strings:
```typescript
date ? format(new Date(date), "dd/MM/yyyy") : "לא צוין"
```
**אף פעם** לא `format(new Date(nullableField))` בלי בדיקת null.

### Query Safety
- לעטוף כל Prisma query ב-try-catch עם `logger.error(...)`
- `|| []` כשניגשים למערכים שיכולים להיות undefined

### Authentication — תבניות קבועות

**ב-API Routes:**
```typescript
import { requireAuth } from "@/lib/api-auth";
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;
}
```

**ב-Server Components:**
```typescript
const session = await getServerSession(authOptions);
if (!session?.user?.id) return null;
```

### Logging — חובה!
`import { logger } from "@/lib/logger"` — **אף פעם** `console.log/error` בקוד production.
```typescript
logger.error("[FeatureName] Description:", {
  userId,
  error: error instanceof Error ? error.message : String(error),
});
```

### חישובי תשלום וחוב
- לייבא מ-`@/lib/payment-utils`
- `calculateSessionDebt(session)` — חוב לפגישה בודדת
- `calculateDebtFromPayments(payments)` — חוב כולל
- פגישה עם `payment: null` = **אין רשומת תשלום** (לא בהכרח לא שולם!)
- פגישה עם `payment.status === "PENDING"` = תשלום קיים אבל עדיין לא שולם
- **אף פעם** לא להתייחס ל-`payment: null` כחוב ב-CRON או תזכורות

### טיפול בשגיאות בדפים
- דף Server Component שטוען נתונים — לעטוף בטיפול-שגיאה ולהחזיר `null` או לזרוק ל-error boundary.
- בכל קבוצת ראוטים שיהיה `error.tsx` שמציג את השגיאה האמיתית.
- כשמשאב לא קיים — `notFound()` מ-`next/navigation`.

### דפוסי קומפוננטות
- `"use client"` רק כשצריך hooks או אינטראקציה.
- **אף פעם לא להעביר אובייקט Prisma ישירות לקומפוננטת לקוח** — רק נתונים "שטוחים" (plain object אחרי `JSON.parse(JSON.stringify(...))`).

### מבנה קבצים
- API routes: `src/app/api/[feature]/route.ts`
- Pages: `src/app/(dashboard)/dashboard/[feature]/page.tsx`
- Components: `src/components/[feature]/[component-name].tsx`
- Utilities: `src/lib/[feature].ts`
- שמות קבצים: kebab-case. משתנים/פונקציות: camelCase

---

## חלק ג׳ — כללי תקשורת

### תקשורת בעברית (feedback_hebrew)
- תמיד לדבר עם המשתמש בעברית
- תוכניות עבודה יש לכתוב בעברית
- כיוון RTL: חיצים תמיד מימין לשמאל (← ולא →)
- תמיד לשמור קבצים בתיקיית הפרויקט עצמה

**לא לערבב אנגלית בתוך משפטים בעברית!**
- שמות קבצים ← לכתוב בשורה נפרדת, לא בתוך משפט
- שמות טכניים ← לתרגם לעברית או להסביר בעברית
- פלט שגיאות ← לתרגם ולהסביר בעברית פשוטה

**Why:** המשתמש לא מבין אנגלית, וערבוב אנגלית בתוך עברית משבש את סדר הקריאה.

### עברית ב-UI (feedback_hebrew_ui)
כל טקסט שהמשתמש רואה חייב להיות **בעברית בלבד**.

סטטוסים של פגישות:
- SCHEDULED → מתוכננת
- PENDING_APPROVAL → ממתינה לאישור
- COMPLETED → הושלמה
- CANCELLED → בוטלה
- NO_SHOW → לא הגיע

---

## חלק ד׳ — תהליך עבודה

### בדיקה יסודית לפני כל שינוי (feedback_thorough_review)
1. **לקרוא את כל הקבצים הקשורים** — מי קורא, מי מושפע
2. **לבדוק UI/דיאלוגים** — z-index, התנגשויות
3. **לבדוק סנכרון עם כל המערכת** — API, hooks, קומפוננטות
4. **לשלוח סוכנים שבודקים רוחבית**
5. **לבדוק גם מצד המשתמש** — האם המשתמש באמת יראה את זה על המסך

### בדיקת מערכת מלאה (feedback_full_system_check)
כשמשנים — לחשוב על גזע וענפים:
1. למפות מי צורך את מה שמשנים (grep לכל הקריאות)
2. API משותף — שינוי משפיע על: יומן, דשבורד, רשימת פגישות, סיכומים, תשלומים
3. hooks משותפים — שינוי משפיע על כל מי שמשתמש בו
4. types משותפים — משפיע על כל המערכת
5. **אל תשנו API בלי לבדוק את כל הצרכנים שלו**

### תקני עבודה (feedback_work_standards)

**לפני כל שינוי:**
1. סוכן Explore שקורא את כל הקובץ + הייבואים
2. למפות צרכנים (grep)
3. לבדוק state ודיאלוגים

**אחרי כל שינוי:**
1. `npx next build`
2. 3 סוכנים: 1) קוד עובד? 2) משהו אחר נשבר? 3) UI הגיוני?
3. רק אחרי שהכל עובר — commit ו-push

**בזמן עבודה:**
1. תמיד Read לפני Edit
2. שינוי אחד בכל פעם
3. להסביר בעברית פשוטה
4. כשמשהו לא עובד — לא לנחש, לבדוק console.error, network, ולקרוא את הקוד

### כללים נוספים (feedback_extra_rules)
1. **גיבוי לפני שינוי גדול** — לא פותחים branch (תמיד עובדים על main). במקום זה: `git status` נקי לפני התחלה, ביקורת הסוכנים המלאה לפני commit, נגיעה רק בקבצים שלי, ובשינוי ענק — commit-ביניים קטן אחרי כל צעד כדי שאפשר לחזור אחורה דרך ההיסטוריה
2. **בדיקה עם נתונים אמיתיים** — לתאר תרחיש ספציפי
3. **לא לגעת בקבצים שלא ביקשו** — דורש אישור
4. **commit קטן עם הודעה ברורה בעברית** — שינוי אחד = commit אחד
5. **בcommit — רק הקבצים שלך, לא `git add .`** — מערבב עם צ'אטים מקבילים
6. **כש-AI אחר כבר עבד** — לבדוק `git log` ולקרוא שינויים אחרונים

### עבודה ישירה על main (feedback_work_on_main)
- לעבוד תמיד ישירות על main
- לא ליצור feature branches
- כל המערכת מסונכרנת דרך main

### עבודה מקבילית של כמה צאטים (feedback_parallel_chats)
יש מספר שיחות Claude שעובדות במקביל על אותו פרויקט.

**מה לא לעשות:**
- לא `git add .` או `git add -A`
- לא `git reset --hard`
- לא למחוק קבצים שלא שלי
- לא stash שלם

**מה כן:**
- לקמט רק קבצים שאני שיניתי, לפי שמות מפורשים: `git add src/path/to/file.ts`
- `git status` לפני commit
- אם רואה שינויים שלא ביצעתי — להשאיר בשקט
- בספק — לשאול את המשתמש

---

## חלק ה׳ — אישורים והרשאות

### אישור אוטומטי לפקודות (feedback_permissions)
המשתמש מעדיף לא לאשר פקודות bash בכל פעם.
- להוסיף הרשאות רחבות ל-settings
- כשנתקלים בפקודה שדורשת אישור — להוסיף להרשאות
- להעדיף הרשאות כלליות (Bash(grep:*)) על פני ספציפיות

---

## חלק ו׳ — אבטחה ו-pre-push

### לפני כל push — 5 סוכנים + 2 סוכני אבטחה (feedback_pre_push)

**מתי מריצים את הסוכנים (שער לפי סיכון):**
- **שינוי קטן בלי סיכון** (טקסט, עיצוב, typo, קובץ בודד — בלי כסף/הרשאות/DB/תאריכים/timezone) ← מספיק בדיקת בנייה בלבד: `npx tsc --noEmit`, `npx vitest run`, `npx eslint <files>`. בלי הסוכנים.
- **שינוי משמעותי/מסוכן** (כסף, הרשאות, מסד נתונים/migration, זמנים/timezone, חוצה-מערכת, בלתי-הפיך) ← ביקורת מלאה: כל 7 הסוכנים (5 + 2 אבטחה), לולאה עד שהכל ירוק, ואז push.

**שלב 1 — 5 סוכנים מקבילים:**
1. **תקינות קוד** — קוד עובד? build עובר? טסטים?
2. **סנכרון מערכת** — לא שברנו צרכנים אחרים?
3. **חוויית משתמש** — UI הגיוני? עברית? דיאלוגים? מובייל?
4. **אבטחה והרשאות** — requireAuth? MANAGER לא יכול דברים של ADMIN?
5. **ביצועים וקצוות** — N+1? timezone? null, חלוקה באפס, DST?

**שלב 2 — 2 סוכני אבטחת סייבר:**
6. **סוכן סייבר — בטיחות מידע רפואי:**
   - דליפת PHI? וקטורי תקיפה (SQL injection, XSS, CSRF, IDOR, path traversal)?
   - חשיפת API keys, tokens, secrets?
   - לוגים בלי PII/PHI?
   - session management בטוח?
7. **סוכן תקינות-אבטחה:**
   - guards החדשים לא חוסמים משתמשים לגיטימיים?
   - סנכרון בין רכיבים עובד?
   - webhooks, cron, אוטומטיים פועלים?
   - UX לא נפגע?

**שלב 3 — לולאת תיקון:**
1. כל ה-7 אישרו ✅ → **פוש אוטומטי, בלי אישור מהמשתמש**
2. 1+ ⚠️ → תקן את הבעיה
3. שלח שוב את כל הסוכנים
4. חזור עד נקי
5. אין מקסימום סבבים

### כללים לתיקוני אבטחה (feedback_security_fixes)

**חוק 1 — לפני שמתחילים: מיפוי מלא**
- `Grep` רחב לכל ה-callers
- לקרוא HANDOFF קיים
- TODO מפורש לכל קובץ לפני השינוי הראשון
- אסור: לעדכן 3 routes ולהשאיר 5 חסרי הגנה

**חוק 2 — helper חדש = חיווט בכל המקומות באותו commit**

**חוק 3 — סדר checks ב-route:**
1. `requireAuth` — מאומת?
2. `loadScopeUser` + scope checks — סוג המשתמש מורשה?
3. `parseBody` עם zod — input תקין?
4. **`findFirst` עם `buildClientWhere`** — האם resource שייך לארגון?
5. **רק עכשיו**: `requireAiConsent` או checks דומים
6. גישה ל-PHI / קריאה ל-LLM / חיוב

**Why:** consent **לפני** scope = Information Disclosure.

**חוק 4 — const חדש = עדכון כל ה-mocks**
- `grep -r "vi.mock.*@/lib/<file>" src/`

**חוק 5 — לא `console.*` אם יש logger**

**חוק 6 — permission חדש = עדכון ALL_PERMISSIONS**

**חוק 7 — לפני commit:**
```bash
npx tsc --noEmit
npx vitest run
git status
git diff --stat
```
אסור `git add .`.

**חוק 8 — לפני push: ביקורת הסוכנים לפי חלק ו׳ (שער לפי סיכון)**
- ההגדרה המחייבת היחידה היא בחלק ו׳: שינוי קטן בלי סיכון → בדיקת בנייה בלבד; שינוי משמעותי/מסוכן → 7 סוכנים (5 + 2 אבטחה) בלולאה עד נקי.
- כשהכל ✅ → פוש אוטומטי בלי אישור

**חוק 9 — HANDOFF נכתב בהתחלה, לא בסוף**

**חוק 10 — כשמוצאים בעיה שצ'אט קודם יצר**
- הודע למשתמש בבירור
- ציין באיזה commit
- הוסף לhandoff עתידי

### שינויים קריטיים — TDD + ביקורת AI חיצונית (feedback_critical_changes_process)

**מתי להפעיל:**
- ✅ הלכה/דת (שבת, חגים, צמות, כשרות)
- ✅ כסף (תשלומים, חיובים, מינויים)
- ✅ זמנים/timezone/cron/DST
- ✅ פעולות בלתי הפיכות (email/SMS, מחיקות)
- ✅ לוגיקה רב-מקרית (subscription/trial, תזכורות)
- ✅ שינוי חוצה-מערכת
- ✅ Migration של Prisma
- ❌ UI, typos, ספריות מינור, קובץ אחד

**תהליך:**
1. **TDD** — טסטים לפני קוד, כולל מקרי קצה (DST, ספריות שנופלות)
2. **ביקורת Cursor Opus** — תוכנית מלאה לקובץ ב-Downloads, סוקר מחזיר חומרה (🔴🟠🟡🟢), לתקן 🔴+🟠 לפני הטמעה

**עקרון:** ספק לטובת התהליך. עדיף שעתיים על טסטים מאשר יום של תיקון פרודקשן.

---

## חלק ז׳ — דפי עבודה טיפוליים

### תהליך יצירת דף עבודה (feedback_worksheet_process)

**לפני הכל — לקרוא:**
`הוראות ליצירת דפי עבודה.md` (בתיקיית Documents)

**סדר עבודה א-ט:**
- א — גישה פסיכולוגית
- ב — מבנה 3 חלקים
- ג — תוכן חובה (הארקה, חמלה, דפוסים, סולם, דוגמה)
- ד — עיצוב (פונט, צבעים, גרדיאנט)
- ה — לוגו (placeholder + סקריפט)
- ו — CSS הדפסה
- ז — דוגמה מלאה
- ח — תהליך עבודה
- ט — בדיקה בדפדפן + Ctrl+P

**הלוגו — הנקודה שכולם נתקעים בה:**
1. HTML עם `__LOGO_DATA_URL__` כ-placeholder
2. סקריפט Node.js שקורא את `public/worksheets/_logo-base64.txt`
3. **אל תקרא PNG, אל תיצור base64 מחדש, אל תטמיע ידנית**

### כללי בסיס (feedback_worksheets)

**עיצוב:**
1. פלטת צבעים בהירה
2. צבע ייחודי לכל גישה (CBT=teal, DBT=violet, ACT=orange)
3. גרדיאנט בהדר — בהיר משמאל ← כהה ימינה
4. אזור הלוגו בהיר יותר
5. לוגו base64 כ-`<img>` tag
6. פונט Heebo

**מבנה — 3 חלקים נפרדים:**
7. הוראות למטפל
8. דף העבודה
9. דוגמה ממולאת
10. פוטר בכל חלק

**תוכן (חובה):**
11. תיבת הארקה ("עצור, נשום 3 נשימות")
12. תיבת חמלה עצמית — **כל פעם ניסוח אחר מותאם לנושא**
13. מעקב דפוסים
14. דוגמה ממולאת בדף נפרד
15. סולם 0-10 עם עיגולים

### מפרט טכני (feedback_worksheet_technical)
- קובץ HTML יחיד עצמאי בתיקייה `public/worksheets/`
- פונט: Heebo מגוגל
- לוגו: placeholder + סקריפט (לא לקרוא PNG, לא ליצור base64 מחדש)
- גרדיאנט בהדר: `linear-gradient(to right, var(--color-400), var(--color-600), var(--color-800))`
- אסור `overflow: hidden` על ההדר
- צבעים: CBT=teal, DBT=violet, ACT=orange, חדש=פלטה חדשה
- מבנה: `.therapist-section`, `.worksheet-body`, `.example-section`
- ב-print: לבטל box-shadow, padding, margin
- `@page { size: A4; margin: 8mm 10mm; }`
- `break-inside: avoid` לסקציות
- `break-after: always` לחלק הראשון, `break-before: always` לדוגמה

**תבניות מאושרות:**
- `public/worksheets/dbt-distress-tolerance-mytipul.html`
- `public/worksheets/cbt-thought-record-mytipul.html`
- `public/worksheets/act-values-identification-mytipul.html`

### עברית בדפי עבודה (feedback_worksheet_hebrew)
- עברית פשוטה, ברורה ותקינה לחלוטין
- ילד בן 9 יבין
- מקצועית, לא ילדותית, לא מסורבלת
- דקדוק תקין

### פוטר בהדפסה (feedback_print_footer)

**הפתרון:**
```html
</div> <!-- סגירת .sheet -->
<div class="print-footer">
  <span>© MyTipul — כל הזכויות שמורות</span>
  <a href="https://mytipul.com">mytipul.com</a>
</div>
```

```css
@media screen { .print-footer { display: none; } }
@page { size: A4; margin: 8mm 10mm 18mm 10mm; }
@media print {
  .footer { display: none; }
  .print-footer {
    display: flex !important; position: fixed; bottom: 0; left: 0; right: 0;
    align-items: center; justify-content: space-between;
    font-size: 0.78rem; padding: 4px 10mm;
    border-top: 1px solid var(--slate-200);
    background: #fff; z-index: 9999;
  }
}
```

**טעויות נפוצות:**
- print-footer בתוך `.sheet` — לא עובד (חייב ב-body)
- `display: none` רגיל — גובר על `display: flex` ב-print
- `@page margin-bottom: 8mm` — הפוטר חופף תוכן (צריך `18mm`)
- כלל CSS כפול על `.footer` — האחרון דורס
- **קאש דפדפן!** — Ctrl+Shift+R אחרי כל שינוי

### קטגוריות דפי עבודה (feedback_worksheet_categories)

קובץ: `src/app/(dashboard)/dashboard/worksheets/page.tsx`

**צבעים:**
- DBT = violet (סגול)
- CBT = teal (טורקיז)
- ACT = orange (כתום)
- Mindfulness = emerald (ירוק)

**זרימה:**
1. בדוק אם הקטגוריה קיימת ב-`categories`
2. אם קיימת — הוסף ל-`worksheets`
3. אם לא — צור קטגוריה חדשה + עדכן `colorMap`
4. דפים חדשים יכולים `simplePlaceholder` עד תצוגה מלאה

---

## חלק ח׳ — מצב הפרויקט (לציטוט בלבד — לאמת מול הקוד הנוכחי)

> ⚠️ הערות אלה נכונות לתאריך שנשמרו — לוודא מול git log/קוד נוכחי לפני שמסתמכים עליהן.

- **aag2618 = USER (לא ADMIN) + OWNER של הקליניקה היחידה** (2026-05-11, אחרי דליפת נתונים)
- **חיבור Cardcom למנויים הושלם** ב-main (2026-05-15)
- **פרטי עסק:** EXEMPT, אסתר גשייד (אשתו), ת.ז. 204083315, אוהב ישראל 32/5 (2026-05-19)
- **הדומיין: mytipul.com (לא .co.il!)** — כל הזכרה ל-.co.il = שגיאה
- **H12 — zod validation:** ~92 routes מכוסים, Batches 1-13 ב-main
- **11 env vars Cardcom ממתינים** ב-Render Dashboard (סבב 14a 2026-05-19)
- **uuid הושלם** 2026-05-26: גרסה 13→14, commit 07d411bd

---

## חלק ט׳ — מקום הזכרון

הקבצים נמצאים בתיקייה:
`C:\Users\User\.claude\projects\c--Users-User-Documents-tipul-AB-tipul-AB-main\memory\`

קובץ אינדקס: `MEMORY.md` — מכיל קישורים לכל הקבצים.
