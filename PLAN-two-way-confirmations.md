# PLAN — אישורי הגעה דו-כיווניים (SMS → WhatsApp)

> מסמך זה הוא הנחיה לצ'אט/מפתח שיבצע. עצמאי — אפשר לעבוד ממנו בלי הקשר קודם.
> כל הכללים הרגילים של הפרויקט חלים: עבודה על `main`, commits קטנים בשמות-קבצים מפורשים (לא `git add .` — יש צ'אטים מקבילים), עברית בכל טקסט-משתמש, `force-dynamic` ל-API, `logger` (לא console), Prisma `Decimal || 0` / `Date | null`, ובדיקות לפני push (5 סוכנים + סוכן סייבר PHI/הרשאות) → push אוטומטי.

## 1. הקשר ומטרה
**מה:** תזכורת לפגישה שמבקשת מהמטופל **להשיב** ("1=מגיע, 2=לבטל"), והתשובה נכנסת **אוטומטית** למערכת ומסמנת את הפגישה.
**למה:** מפחית אי-הגעות; המזכירה רואה במבט אחד מי אישר/מי לא ענה ומתקשרת רק לחסרים; פחות עדכון ידני. סטנדרט אצל מתחרים (SimplePractice/Jane וגם הישראליות CliniKit/C2U).
**קהל חרדי — דיסקרטיות חובה:** ההודעה חייבת להיות מינימלית ("תזכורת לפגישה מחר 10:00"), בלי לרמוז על תוכן טיפולי/פסיכולוגי.

## 2. ⚠️ תנאי-מקדים עסקי (לאמת לפני שורת-קוד אחת)
דו-כיווני עולה כסף נוסף ולא מאומת מול החוזה של המשתמש:
- **קליטת תשובות SMS** דורשת בדרך-כלל **מספר נכנס ייעודי** אצל Pulseem (דמי-מנוי חודשיים ± תשלום להודעה נכנסת).
- **WhatsApp** מתומחר ע"י מטא לפי "שיחה" (חלון 24ש') ודורש **אישור תבנית מראש** (template approval).
- **לאמת מול Pulseem:** מה הזר/חבילה כוללים, עלות מספר נכנס, ועלות-להודעה. **להציג למשתמש לאישור לפני מימוש.**
- **המלצת פיזור:** Phase 1 = SMS דו-כיווני בלבד (זול ומיידי). Phase 2 = WhatsApp (אחרי אישור תבנית + תמחור).

## 3. מה כבר קיים (לשימוש חוזר — לא לבנות מאפס!)
- **Webhook נכנס מלא:** [`src/app/api/webhooks/pulseem/route.ts`](src/app/api/webhooks/pulseem/route.ts) — כבר מאמת HMAC/Bearer, מנרמל טלפון ישראלי, **מדדפ לפי `messageId`**, מזהה מטופל לפי טלפון (3 אסטרטגיות) ומטפל, שומר ב-`CommunicationLog` (`type:"INCOMING_SMS"`, `status:"RECEIVED"`), ויוצר `Notification` למטפל. **זו נקודת-הכניסה לפענוח 1/2.**
- **`CommunicationLog`** (schema ~1053): יש `sessionId` (nullable) — אפשר לקשר תשובה לפגישה; ו-`messageId` עם dedup.
- **`CommunicationSetting`** (schema ~1136): תבניות SMS לפי-סוג + toggles (`sendReminder24hSMS`, `templateReminder24hSMS` וכו'). כאן עורכים את נוסח התזכורת ומוסיפים toggle.
- **תזכורת יוצאת 24ש':** cron [`src/app/api/cron/reminders/route.ts`](src/app/api/cron/reminders/route.ts) (ו-`reminders-2h`). כאן מוסיפים את שורת "השב/י 1/2".
- **זרימת בקשת-ביטול קיימת:** שדה `TherapySession.cancellationRequestedAt` + מסך [`/dashboard/cancellation-requests`]. **"2=ביטול" מתחבר לזה ישירות** (לא צריך זרימת-ביטול חדשה).
- **מוקד המזכירה:** [`src/components/dashboard/secretary-home.tsx`](src/components/dashboard/secretary-home.tsx) — כרטיס "פגישות מחר" + "מה דורש טיפול" (רשימות חריגים מפורטות). **כאן מוסיפים "לא אישרו הגעה".** (הקומפוננטה `SessionRow` וה-select האדמיניסטרטיבי כבר שם.)
- **שבת/חג:** `isShabbatOrYomTov` + תבנית התור [`src/app/api/cron/booking-outbox/route.ts`](src/app/api/cron/booking-outbox/route.ts) — לדחיית שליחה/תגובה בשבת.

## 4. שינוי סכמה (Prisma)
ב-`TherapySession` להוסיף סטטוס אישור הגעה (לא לגעת ב-`cancellationRequestedAt` הקיים):
```prisma
enum AttendanceConfirmation {
  PENDING     // נשלחה בקשה, אין תשובה
  CONFIRMED   // המטופל אישר ("1")
  DECLINED    // המטופל ביקש לבטל ("2") — מפעיל גם cancellationRequestedAt
}
// בתוך model TherapySession:
attendanceConfirmation   AttendanceConfirmation @default(PENDING)
attendanceConfirmedAt    DateTime?
```
פריסה: `prisma generate` + `prisma db push` (כמו שאר השינויים בפרויקט). ברירת-מחדל `PENDING` בטוחה לרשומות קיימות.

## 5. שלבי מימוש (Phase 1 — SMS)
**שלב א — תזכורת יוצאת עם בקשת-תשובה**
1. ב-`CommunicationSetting`: toggle חדש `requestAttendanceConfirmation Boolean @default(false)` + (אופציונלי) שדה נוסח קצר. ב-UI ההגדרות ([`/dashboard/settings`]) — מתג "בקש אישור הגעה בתזכורת".
2. ב-cron התזכורות: כשהמתג דלוק, להוסיף לנוסח את "השב/י 1=מגיע/ה · 2=לבטל" ולסמן את הפגישה `attendanceConfirmation=PENDING`. נוסח **דיסקרטי**. לכבד `isShabbatOrYomTov` (כבר נעשה שם).

**שלב ב — פענוח התשובה ב-webhook** (`pulseem/route.ts`, אחרי זיהוי ה-client הקיים)
3. לפענח את גוף ההודעה: trim, לזהות "1"/"כן"/"מאשר" = CONFIRMED, "2"/"לא"/"ביטול" = DECLINED. אם לא חד-משמעי — להשאיר את ההתנהגות הקיימת (לוג + התראה למטפל), בלי לשנות פגישה.
4. למצוא את **הפגישה הרלוונטית**: הפגישה הקרובה של אותו `client` עם `status:"SCHEDULED"` ב-48ש' הקרובות. אם אין — לוג + התראה בלבד. אם כמה — הקרובה ביותר.
5. CONFIRMED → `attendanceConfirmation=CONFIRMED`, `attendanceConfirmedAt=now`. DECLINED → **לחבר לזרימת הביטול הקיימת** (להציב `cancellationRequestedAt` + להתריע, בדיוק כמו ביטול יזום-מטופל) ו-`attendanceConfirmation=DECLINED`.
6. לקשר את ה-`CommunicationLog` הנכנס ל-`sessionId` (השדה כבר קיים). ה-dedup לפי `messageId` כבר מונע עיבוד כפול.
7. **בידוד tenant:** לעדכן רק פגישה ששייכת לאותו `therapistId`/`organizationId` שזוהה — לא לחצות גבולות ארגון.

**שלב ג — הצגה (UI)**
8. **מוקד המזכירה** (`secretary-home.tsx`): בכרטיס "פגישות מחר" — צ'יפ סטטוס לכל פגישה (אישר/ממתין/ביטול, כמו במוקאפ). ב"מה דורש טיפול" — שורת "לא אישרו הגעה (N)" עם רשימה (לשכפל את תבנית רשימת בקשות-הביטול שכבר שם). שמירה על select אדמיניסטרטיבי בלבד (להוסיף `attendanceConfirmation` ל-select — זה לא PHI).
9. **יומן:** באירוע/בדיאלוג הפגישה — חיווי "✓ אושר"/"ממתין". (קבצים: `src/components/calendar/calendar-event-content.tsx`, `session-detail-dialog.tsx`.)

## 6. אבטחה ותקינות (חובה)
- ה-webhook כבר מאומת (HMAC/Bearer) ו-rate-limited — לא להחליש. ה-dedup לפי `messageId` כבר קיים — אידמפוטנטיות מובטחת.
- **לא PHI:** סטטוס אישור הגעה הוא אדמיניסטרטיבי → מותר למזכירה. לא להוסיף topic/notes ל-select.
- בידוד רב-מטפלי: עדכון פגישה רק בתוך ה-`organizationId`/`therapistId` שזוהה מהטלפון.
- דיסקרטיות: נוסח מינימלי, בלי רמז טיפולי (קריטי לקהל היעד).
- שבת/חג: לא לשלוח/לעבד תזכורות בשבת (להשתמש ב-`isShabbatOrYomTov` הקיים; קליטת webhook יכולה להישמר וללוג, אבל הודעת-תשובה יוצאת — אם תהיה — בתור).

## 7. אימות (end-to-end)
1. `npx tsc --noEmit` נקי + `npx eslint <קבצים>` (ה-build המקומי נכשל על `rm -rf` בווינדוס — להשתמש ב-tsc).
2. סימולציית webhook: POST ל-`/api/webhooks/pulseem` עם `{from, text:"1", messageId}` של מטופל-בדיקה שיש לו פגישה מחר → לוודא `attendanceConfirmation=CONFIRMED`. שוב עם `text:"2"` → `cancellationRequestedAt` נקבע + סטטוס DECLINED. שליחה כפולה של אותו `messageId` → לא משנה כלום (dedup).
3. מקרי-קצה: אין פגישה קרובה; טקסט לא-ברור; מטופל לא מזוהה — לא קורסים, נשמרת ההתנהגות הקיימת (לוג+התראה).
4. UI: מוקד המזכירה מציג סטטוסים; אין דליפת PHI; עברית תקינה.
5. בדיקת בידוד: תשובה ממספר בארגון א' לא נוגעת בפגישה בארגון ב'.

## 8. מחוץ לסקופ / שלבים הבאים
- **Phase 2 — WhatsApp:** אחרי אישור תבנית מול מטא + תמחור. אותה לוגיקת-פענוח; ערוץ אחר (Pulseem WhatsApp). לבדוק אם ה-webhook הנכנס תומך גם ב-WhatsApp או צריך endpoint נפרד.
- תזכורת-תזכורת למי שלא ענה (nudge) — שלב עתידי.
- אין צורך לגעת בזרימת הביטול הקיימת מעבר לחיבור "2" אליה.

## 9. הערכת מאמץ
בינוני — לא מאפס: ה-SMS היוצא, ה-webhook הנכנס, ה-dedup, זיהוי-המטופל וזרימת-הביטול כבר קיימים. עיקר העבודה: פענוח 1/2 + שדה סטטוס + הצגה ב-2 מקומות (מוקד + יומן) + toggle בהגדרות.
