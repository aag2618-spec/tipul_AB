# HANDOFF — המשך פיצ'ר "שלי / כל הקליניקה" (view-scope) + סימון מטפל

> נכתב כדי שצ'אט חדש ימשיך בדיוק מהנקודה הזו. קרא את כל הקובץ לפני שמתחילים.
> תאריך: 2026-06-04.

---

## 0. למי זה והקשר
- **המשתמש = בעל קליניקה, מטפל, לא מתכנת.** לדבר **עברית פשוטה**, להסביר "כמו לילד בכיתה א'", להציג את המהות ולא להציף בקוד. לפנות בלשון זכר.
- הוא עושה **בדיקת קבלה** לפיצ'ר הרב-מטפלי "שלי / כל הקליניקה" + בקשה להציג **סימון מטפל** (נקודת-צבע + שם) בכל המסכים, כמו שכבר קיים בטאב **מטופלים**.

## 1. כללי עבודה — חובה לקרוא קודם
- מקור הכללים: `.cursor/rules/*.mdc` (נטענים אוטומטית ב-Cursor) + `הוראות-עבודה-עם-Claude.md`.
- **ביקורת לפני commit לפי סיכון:** שינוי קטן בלי סיכון → בדיקת בנייה בלבד (`tsc`/`eslint`). שינוי מסוכן (כסף/הרשאות/DB/זמנים) → 5 + 2 סוכני אבטחה בלולאה עד GREEN.
- **טווח קבצים strict:** לקמט רק קבצים שלי, **נתיבים מפורשים** (`git add <path>`), אף פעם לא `git add .`. לעבוד על **main** בלבד. **push אוטומטי** אחרי commit. הודעת commit קצרה בעברית שמסבירה למה.
- **צ'אט מקביל פעיל:** צ'אט שני בונה **צ'אט-בין-העובדים** ב-`src/components/chat/*`. **לא לגעת שם.** הוא לפעמים מריץ `git add -A` ו"בולע" שינויים לא-שמורים — לכן **לקמט מהר** עם נתיבים מפורשים. אם `tsc` מראה שגיאה ב-`src/components/chat/team-chat-view.tsx` — זה ה-WIP שלהם, לא שלך.
- זיכרון פרויקט: `C:\Users\User\.claude\projects\C--Users-User\memory\` (MEMORY.md + feedback_workflow.md).

## 2. איך עובד מנגנון ה-view-scope (חשוב להבנה)
- Cookie בשם `mytipul_view` = `"personal"` או `"clinic"`. המתג: `src/components/view-scope-toggle.tsx` (כותב cookie + `router.refresh()`).
- **שרת = מקור האמת:** `src/lib/view-scope.ts` → `shouldScopePersonal(scopeUser)` מחזיר `true` **רק לבעל/ת קליניקה** במצב personal. `src/lib/scope.ts` → `buildSessionWhere/buildClientWhere/buildPaymentWhere(scopeUser, { personalOnly })`.
- **דף Server Component** (מטופלים, פגישות, ממתינים-לסיכום): קורא `shouldScopePersonal` ומרנדר ישירות → מתעדכן ב-`router.refresh`. שים `key={personalOnly ? "personal" : "clinic"}` אם הרכיב מחזיק את הנתונים ב-`useState(initial...)` (אחרת הוא "מקפיא").
- **דף client שמושך מ-API** (תשלומים, קבלות, יומן): צריך לקרוא את ה-cookie ולהוסיף `viewScope` לתלויות ה-fetch כדי שייטען מחדש בהחלפת המתג. דפוס:
  ```ts
  const viewScope = typeof document !== "undefined" &&
    /(?:^|;\s*)mytipul_view=clinic/.test(document.cookie) ? "clinic" : "personal";
  useEffect(() => { fetchX(); }, [viewScope]);
  ```
- **צבע מטפל:** `getTherapistAccent(therapistId)` מ-`@/lib/calendar/event-colors` (צבע דטרמיניסטי, אותו מטפל = אותו צבע בכל המערכת).
- **דפוס הסימון (להעתיק 1:1):** מציגים **רק במצב "כל הקליניקה"**:
  ```tsx
  {viewScope === "clinic" && item.therapistName && (
    <div className="flex items-center gap-1.5 mt-1">
      <span className="inline-block h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: getTherapistAccent(item.therapistId) }} />
      <span className="text-sm font-semibold text-foreground truncate">{item.therapistName}</span>
    </div>
  )}
  ```
  (בדף Server Component מעבירים `showTherapist = isClinicOwner(scopeUser) && !personalOnly` במקום לקרוא cookie.)
- **תבנית ייחוס שעובדת:** טאב מטופלים — `src/components/clients/clients-grid-with-search.tsx` שורות 204, 207.

## 3. מה כבר נעשה (commits ב-main, נדחפו)
| נושא | commit |
|---|---|
| איחוד קבצי הכללים | `5fbc9a5b` |
| תיקון רענון מתג: פגישות + תשלומים | `e2842d73` |
| תיקון רענון מתג: קבלות (+ API) | `d5b12b03` |
| תיקון רענון מתג: יומן (useCalendarData) | `8068fe98` |
| סימון מטפל: תשלומים — רשימת חובות | `17f9c497` |
| הבלטת שם המטפל (גדול/מודגש) | `fdcdb21d` |
| סימון מטפל: תשלומים — היסטוריה | `0b907b13` |
| ממתינים-לסיכום: חיבור מתג + סימון מטפל | `bd8fc2a4` |
| סימון מטפל: קבלות | `82107cd3` |

**סטטוס:** מתג + סימון מטפל עובדים ב: מטופלים, תשלומים (חובות+היסטוריה), קבלות, ממתינים-לסיכום.

## 4. מה נשאר — הבאגים הפתוחים (לפי עדיפות)

### A. [באג שדווח] טאב "פגישות" — אין סימון מטפל על הכרטיסים
- במצב "כל הקליניקה" רואים פגישות של כל המטפלים, אבל הכרטיס לא מציין של מי (למשל "יחיאל רבינוביץ" שייך למלכה — מופיע בלי שם המטפלת).
- **קבצים:** `src/app/(dashboard)/dashboard/sessions/page.tsx` (Server Component; כבר מחשב `personalOnly` ושם `key` ל-`SessionsView`), `src/components/sessions/sessions-view.tsx`, `src/components/sessions/session-card.tsx`.
- **תיקון (אותו דפוס):**
  1. ב-`sessions/page.tsx` → `getSessions`: להוסיף ל-`include` את `therapist: { select: { id: true, name: true } }`, ולהוסיף ל-serialized object `therapistId`/`therapistName`.
  2. להעביר `showTherapist = isClinicOwner(scopeUser) && !personalOnly` ל-`SessionsView` → ל-`SessionCard`.
  3. ב-`session-card.tsx`: להוסיף ל-type של `Session` את `therapistId`/`therapistName`, ולרנדר את נקודת-הצבע + השם (הדפוס מסעיף 2) ליד שם המטופל. ייבוא `getTherapistAccent`.

### B. [יומן] המתג לא מסונכרן עם מסנן "מטפלים" של היומן
- **שורש הבעיה:** ליומן יש מסנן "מטפלים" **משלו** (client-side) — `selectedTherapistIds` ב-`src/app/(dashboard)/dashboard/calendar/page.tsx` (state ~243-298; ברירת מחדל `[currentTherapistId]` בשורות ~267-279; מסנן את האירועים המוצגים ~356-363). המתג הגלובלי **כן מושך** את כל הפגישות מהשרת (התיקון ב-`8068fe98` עובד), אבל מסנן ה"מטפלים" עדיין מסומן רק על הבעלים ולכן מסתיר את האחרים.
- **תיקון מוצע:** לגרום ל-`selectedTherapistIds` להגיב למתג: כש-`viewScope==="clinic"` → לסמן את **כל** מזהי המטפלים; כש-`"personal"` → רק הבעלים. effect שמאזין ל-`viewScope` (cookie) + לרשימת המטפלים שנטענה (`/api/clinic/therapists`), **בלי לדרוס בחירה ידנית בכל render** (לעקוב אחרי viewScope קודם דרך `useRef` ולאפס רק בשינוי אמיתי).

### C. [יומן] משבצת צפופה חתוכה + אין tooltip צף
- **שורש הבעיה:** אירועים חופפים נדחסים צר (`slotEventOverlap={false}` ב-`calendar/page.tsx` ~802) + `overflow-hidden` על תוכן האירוע (`src/components/calendar/calendar-event-content.tsx` שורה 116). הריחוף מציג רק `title=` (tooltip מקורי חלש), לא חלון צף. רכיב Radix Tooltip קיים (`src/components/ui/tooltip.tsx`) אבל לא בשימוש ביומן.
- **תיקון מוצע:** לעטוף את תוכן האירוע ב-Radix Tooltip/HoverCard שמציג מטופל + מטפל + שעה, כך שגם אירוע צפוף יהיה קריא בריחוף.

### D. [#5] הודעות — דחוי, דורש תיאום
- `src/app/(dashboard)/dashboard/notifications/page.tsx` — ההתראות אישיות (לא scope-aware). החלטת המשתמש: **להשאיר אישי**, ולהוסיף הערה קטנה "ההתראות אישיות — המתג 'כל הקליניקה' לא חל כאן". ⚠️ חופף לאזור הצ'אט-בין-העובדים של הצ'אט השני — **לתאם לפני שנוגעים**.

## 5. סדר עבודה מומלץ לצ'אט החדש
1. **A (פגישות)** — הכי פשוט, אותו דפוס מוכר. התחלה טובה.
2. **B (סנכרון מתג↔מסנן ביומן)** — עדין; לבדוק עם המשתמש את ההתנהגות הרצויה.
3. **C (tooltip צף ביומן)** — שיפור UX.
4. **D (הודעות)** — רק אחרי תיאום עם הצ'אט השני.
- אחרי כל תיקון: בדיקת בנייה + (לשינוי מסוכן) סוכני ביקורת → commit בעברית בנתיבים מפורשים → push → לומר למשתמש איך לבדוק על המסך.
