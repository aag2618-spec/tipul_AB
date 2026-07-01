# תוכנית — פעולות מהירות אמיתיות בדשבורד המזכירה

## מטרה
להחליף את כרטיס "פעולות מהירות" הקיים (5 קישורים שכפולים מהניווט הצדדי) בכרטיס
פעולות *אמיתי* שחוסך עבודה למזכירה:
1. **שליחת תזכורת לפגישות** — מחר או בעוד יומיים, בחירה פרטנית של פגישות.
2. **שליחת קישור זימון עצמי** למטופל/ים.

## החלטות עיצוב (אושרו ע"י המשתמש)
- אופק זמן לתזכורות: **בורר "מחר" / "בעוד יומיים"**.
- בחירת פגישות: **פרטנית** — רשימה עם תיבות סימון (ברירת מחדל: מסומנות רק
  פגישות שעדיין לא נשלחה להן תזכורת).

## ממצאי החקירה (מצב קיים)

### תזכורות
- תזכורות פגישה נשלחות **רק אוטומטית** דרך cron: `src/app/api/cron/reminders/route.ts`
  (24 שעות) ו-`reminders-2h/route.ts` (שעתיים). אין endpoint לשליחה ידנית של תזכורת פגישה.
- ה-cron רץ ללא scope (כאדמין). שולף לפי חלון זמן, מסנן `status:SCHEDULED`,
  בודק `communicationSetting.send24hReminder`, ומבצע **dedup** מול `CommunicationLog`
  (`sessionId + type:REMINDER_24H + channel + status:SENT`) — נפרד למייל ול-SMS.
- ערוצים: מייל דרך `sendEmail` (Resend) + `create24HourReminderEmail`; SMS דרך
  `sendSMSIfEnabled` (Pulseem) שמכבד את הגדרת ה-SMS של המטפל.
- הגנת שבת/חג: `isShabbatOrYomTov` / `wasShabbatInLastHours`.

### זימון עצמי
- קיים endpoint מלא: `POST /api/user/booking-settings/send-link` + מודל `BookingLink`
  (token 60 יום) + דיאלוג בחירת מטופלים ב-`settings/booking/page.tsx`.
- **בעיה שהתגלתה:** ה-endpoint בנוי סביב `therapistId: userId` (הקורא) — בודק את
  `bookingSettings` של הקורא ויוצר את הקישור בשמו. נכון רק כשהמטפל שולח לעצמו.
  מזכירה משרתת כמה מטפלים; כל מטופל שייך למטפל אחר (`Client.therapistId`).
  הסכמה עצמה מתעדת: `BookingLink.therapistId == client.therapistId`. לכן צריך
  שהקישור ייווצר בשם המטפל של כל מטופל, ושההגדרות ייבדקו מולו.

## תוכנית מימוש — שני שלבים נפרדים (commit לכל שלב)

### שלב 1 — תזכורות פגישה ידניות
**Backend:** `src/app/api/sessions/send-reminders/route.ts` (חדש, POST)
- Body (zod): `{ sessionIds: string[] }` (1–50).
- אימות: `requireAuth` → `loadScopeUser`. מזכירה חייבת `canSendReminders`.
- טעינת פגישות עם **scope** — `where: { id:{in}, AND:[buildSessionWhere(scopeUser),
  { status:"SCHEDULED" }] }` + `client` + `therapist.communicationSetting`.
  (מונע IDOR — מזכירה לא תשלח לפגישה מחוץ לסקופ שלה.)
- חסימת שבת/חג (`isShabbatOrYomTov`).
- לכל פגישה: dedup REMINDER_24H (מייל + SMS בנפרד) → שליחה (מיחזור לוגיקת ה-cron)
  → `CommunicationLog`. **החלטה:** פעולה ידנית גוברת — שולחים מייל גם אם
  `send24hReminder=false`; SMS עדיין מכבד את הגדרת ה-SMS (עולה קרדיט).
- מחזיר: `{ sent, skipped, failed, errors }`.
- שקילה: לחלץ helper משותף מ-`reminders/route.ts` כדי לא לשכפל (רק אם נקי ובטוח).

**Frontend:** רכיב client חדש `secretary-quick-actions.tsx`
- כפתור "שלח תזכורות" → דיאלוג: בורר מחר/יומיים → רשימת פגישות עם checkbox
  (מסומנות אלו ללא תזכורת) → "שלח ל-N" → POST → toast תוצאה.
- מקבל מהשרת פגישות מחר + יומיים (id/שם/שעה/מטפל/reminderSent/ערוץ-זמין).

### שלב 2 — שליחת קישור זימון מהדשבורד
**Backend:** הרחבת `send-link/route.ts` (זהירות — בשימוש מטפלים!)
- אם הקורא מזכירה/בעל-קליניקה: גזירת `therapistId` **לכל מטופל** מ-`client.therapistId`,
  בדיקת `bookingSettings` של אותו מטפל, ויצירת הקישור בשמו. מטפל יחיד — ללא שינוי.

**Frontend:** הוספת כפתור "שלח קישור זימון" לכרטיס + דיאלוג בחירת מטופלים
(מיחזור הדפוס מ-`settings/booking`).

### עדכון משותף
`src/components/dashboard/secretary-home.tsx`:
- הסרת כרטיס "פעולות מהירות" הישן (שורות ~606–646).
- הוספת הרכיב החדש + טעינת הנתונים הדרושים (פגישות בעוד יומיים).

## סיכוני אבטחה לבדיקה
- **Scope/IDOR**: כל טעינת פגישות/מטופלים דרך `buildSessionWhere`/`buildClientWhere`.
- **PHI**: לא להחזיר notes/topic; שמות/טלפונים רק במסגרת הסקופ.
- **כפילות**: dedup מול `CommunicationLog` בשני הערוצים.
- **שבת/חג**: חסימה בשרת + ב-UI.
- **Rate limit / הרשאות**: `canSendReminders` בשני ה-endpoints.

## בדיקות לפני פוש
- `npm run build`.
- סבב סוכנים (5 סנכרון + סייבר/PHI + תקינות-אבטחה) עד נקי — לפי כללי העבודה.
- בדיקת UI: דיאלוגים, מצבי ריק, שבת, מטופל בלי מייל/טלפון.

## סטטוס מימוש

### שלב 1 — תזכורות ✅ הושלם (commit 3ec3db2e)
endpoint + תבנית גמישה + כרטיס. tsc/lint/build נקי, 3 סוכני ביקורת, תוקנו:
סיווג "טלפון בלבד + SMS כבוי", `router.refresh()` אחרי שליחה, סדר rate-limit.

### שלב 2 — קישור זימון עצמי ✅ הושלם
- `send-link/route.ts` הורחב: ענף מזכירה (sendsOnBehalf=isSecretary) יוצר את
  הקישור בשם `client.therapistId`, בודק bookingSettings + מנכה SMS מאותו מטפל.
  זרימת המטפל/בעלים (else branch) נשמרה זהה למקור (אומת ב-git diff + סוכן).
- דיאלוג זימון נוסף לרכיב (טעינת מטופלים, חיפוש, בחירה מרובה, הודעה מותאמת).
- 2 סוכני ביקורת. תוקנו: organizationId בשאילתת מטפלים (הגנת-עומק), תווית
  בחר/בטל דינמית + מונה "נבחרו", aria-label, אי-סגירת דיאלוג בכשל טעינה.

## חוב עתידי (מחוץ ל-scope, לא רגרסיה)
- **בעלים-מטפל ששולח קישור זימון למטופל של קולגה** משייך את הקישור לעצמו
  (`therapistId: userId`) במקום למטפל האמיתי — כי `sendsOnBehalf=isSecretary`
  בלבד. קדם-קיים (היה כך גם לפני ההרחבה). תיקון עתידי דורש טיפול ב-400 מול
  skip של ה-button בכרטיס מטופל (`send-booking-link-button.tsx`).
