# תוכנית: "כל הפגישות + ביטול" מתוך החיפוש המהיר

תאריך: 2026-06-22 · עבודה ישירה על `main`

## מה ביקש המשתמש
בפופ-אפ של החיפוש המהיר (הרכיב בצילום — `global-search.tsx`, משותף למזכירה/מנהלת/מטפל),
חוץ מ"קבע פגישה" — להוסיף אפשרות לראות את **כל הפגישות של המטופל** עם **ביטול** לכל אחת.
הביטול לפי חוקי הביטול הקיימים: ביטול בתוך X שעות → אפשר לחייב דמי ביטול; להציג שזה
"בתוך X שעות ולכן יחויב"; לדרוש **אישור נוסף**; ואז לאפשר **העברה לעמודת התשלום**.

## החלטות שאושרו (3 שאלות)
1. **תצוגה:** דיאלוג בתוך החיפוש (לא ניווט לדף נפרד).
2. **סף החיוב:** לפי הגדרת הקליניקה `minCancellationHours` (ברירת מחדל 24), ולהציג את המספר האמיתי.
3. **אחרי החיוב:** בכל ביטול בתוך החלון — לתת לבחור: **רשום חוב** / **גבה עכשיו** / **ללא חיוב**.

## מצב קיים (מה כבר יש — שימוש חוזר, לא להמציא)
- `GET /api/sessions?clientId=ID` — מחזיר את כל פגישות המטופל, עם scope + סינון פרטיות למזכירה + `payment.paidAmount`.
- `PUT /api/sessions/[id]` עם `{status:"CANCELLED", createPayment:true, markAsPaid:false, cancellationReason}` → יוצר חיוב **ממתין** (חוב) שמופיע בתשלומים. (= "רשום חוב")
- `PATCH /api/sessions/[id]/status` עם `{status:"CANCELLED", cancellationReason}` → ביטול **ללא** חיוב.
- `QuickMarkPaid` (רכיב נשלט עם `open`/`onOpenChange`/`hideButton`) → מסך גבייה/סימון-שולם. (= "גבה עכשיו")
- `useMyPermissions()` → `permissions.canViewPayments` (אופטימי true, fail-closed false). זה ה-gate ל-UI.
- `minCancellationHours` יושב על `communicationSetting` של **המטפל** (per-therapist), `Int @default(24)`.
- צד-השרת כבר אוכף: מזכירה ללא `canViewPayments` מקבלת 403 על `createPayment/markAsPaid`. ה-UI gating רק משלים.

⚠️ נקודת תשומת לב שהתגלתה: היום יש **חוסר-אחידות** בסף — 24ש' ב-`cancel-session-dialog`, 48ש' מקודד
ב-`session-detail-dialog`. התוכנית מאחדת על `minCancellationHours` **רק במסך החדש**; לא נוגעים
בהתנהגות המסכים הקיימים בשלב הזה (כדי לא להרחיב את השינוי). אם תרצה — אאחד גם אותם בהמשך.

## השינויים

### 1. שרת — `GET /api/sessions` (תוספת לא-שוברת)
- להוסיף פרמטר `includePolicy=true`. רק כשהוא קיים — לצרף לכל פגישה שדה `minCancellationHours`
  (מ-`therapist.communicationSetting.minCancellationHours`, ברירת מחדל 24).
- כל הקוראים הקיימים לא מושפעים (בלי הפרמטר — תגובה זהה byte-for-byte).
- זמין גם למזכירה (זו מדיניות תזמון, לא תוכן קליני).

### 2. רכיב חדש — `src/components/clients/client-sessions-dialog.tsx`
דיאלוג שמקבל `clientId`, `clientName`, `open`, `onOpenChange`:
- טוען `GET /api/sessions?clientId=ID&includePolicy=true`.
- טאבים: **קרובות** / **היסטוריה** (כמו ב-`sessions-view`). שורה לכל פגישה: תאריך+שעה, סטטוס, מחיר,
  ושם המטפל אם שונה מהמשתמש (רב-מטפלים).
- כפתור **"בטל"** רק לפגישות `SCHEDULED` עתידיות.
- זרימת ביטול:
  - מחשב `hoursUntil`. אם `hoursUntil >= minCancellationHours` **או** `price==0` → ביטול פשוט:
    שדה סיבה (אופציונלי) → "בטל פגישה" → `PATCH .../status` `CANCELLED`. טוסט "הפגישה בוטלה".
  - אם `hoursUntil < minCancellationHours` **וגם** `price>0` → פאנל אזהרה:
    «הביטול בתוך **{X} שעות** מהפגישה — לפי מדיניות הקליניקה ניתן לחייב דמי ביטול (**₪{price}**)».
    שדה סיבה + שלוש בחירות (gated ב-`canViewPayments`):
    - **רשום חוב** → `PUT` `createPayment:true, markAsPaid:false` (חוב ממתין בתשלומים).
    - **גבה עכשיו** → `PATCH` `CANCELLED` ואז פתיחת `QuickMarkPaid` (amount=price).
    - **ללא חיוב** → `PATCH` `CANCELLED` (+ שמירת סיבת אי-חיוב כהערה, אופציונלי).
    - שתי האפשרויות המחייבות דורשות **אישור נוסף** ("כן, לחייב ₪{price}") — בדיוק כפי שביקשת.
  - מזכירה ללא `canViewPayments`: רואה רק **ללא חיוב** (שאר האפשרויות מוסתרות; השרת חוסם ממילא).
- אחרי כל פעולה: רענון הרשימה בתוך הדיאלוג (state מקומי) + טוסט.

### 3. `global-search.tsx` — נקודת הכניסה
- בכל שורת תוצאה, ליד "קבע פגישה", להוסיף כפתור-אייקון (לוח-שנה/שעון, title="כל הפגישות") שפותח
  את הדיאלוג החדש עבור אותו מטופל. "קבע פגישה" נשאר כפי שהוא.

## בדיקות (כי זה כסף — לפי כללי השינויים הקריטיים)
- helper טהור `shouldChargeCancellation(hoursUntil, minHours, price)` עם בדיקות יחידה:
  גבול מדויק (=minHours → לא מחייב), בתוך החלון, מחיר 0, minHours מותאם.
- בדיקת שרת ל-`includePolicy` (מחזיר `minCancellationHours`, ברירת מחדל 24, ושבלי הפרמטר אין שינוי).
- בדיקה ידנית: מטפל רגיל (חיוב), מזכירה ללא הרשאה (רק "ללא חיוב"), מנהלת (רב-מטפלים).

## אילוצים (memory)
- שום שינוי לא ידלוף PHI למזכירה (משתמשים ב-GET שכבר מסנן).
- כל טקסט שמוצג — עברית תקינה. עיצוב shadcn מתמזג עם האתר.
- לפני פוש: 5 סוכנים + סוכן סייבר + תקינות-אבטחה בלולאה עד נקי (feedback_pre_push).
