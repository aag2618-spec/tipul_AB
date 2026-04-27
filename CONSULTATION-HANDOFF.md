# העברת משימה — תיקוני פיצ'ר "פגישת ייעוץ" (סבב 2)

## רקע — מה הפיצ'ר

פיצ'ר "פגישת ייעוץ" מאפשר ליועצים/מנטורים ליצור פגישות מהירות עם פונים מזדמנים (לא מטופלים קבועים) ישירות מהיומן, בלי לפתוח תיק מלא.

## ארכיטקטורה

המערכת בנויה על "גזע וענפים" — Client הוא הגזע, וממנו יוצאים ענפים: פגישות, תשלומים, קבלות, סיכומים. הפונה המזדמן הוא Client רגיל עם `isQuickClient: true` — כך שכל הענפים (תשלומים, קבלות, סיכומים) עובדים בדיוק כמו מטופל רגיל.

### שדות שנוספו לDB:
- `Client.isQuickClient` (Boolean, default false) — מסמן פונה מזדמן
- `TherapySession.topic` (String?, Text) — נושא הפגישה (חובה לייעוץ)

### מיגרציה:
- `prisma/migrations/add_quick_client_and_session_topic.sql` — עדיין לא הורצה על הDB (צריך להריץ ידנית)

## מה כבר עובד (7 שלבים שהושלמו)

### שלב 1-2: סכמה + API
- **קבצים:** `prisma/schema.prisma`, `src/lib/validations/client.ts`, `src/lib/validations/session.ts`
- **API routes שהשתנו:**
  - `src/app/api/clients/route.ts` — GET מחזיר `isQuickClient`, POST תומך ביצירת פונה מהיר
  - `src/app/api/clients/[id]/route.ts` — PUT תומך בשדרוג (isQuickClient→false, אוטומטי כשממלאים firstName+lastName)
  - `src/app/api/sessions/route.ts` — POST/GET עם topic + isQuickClient
  - `src/app/api/sessions/[id]/route.ts` — PUT עם topic

### שלב 3: דיאלוג יצירת פגישה ביומן
- **קובץ:** `src/components/calendar/new-session-dialog.tsx`
- כפתור "+ פגישת ייעוץ" באותה שורה של בחירת מטופל
- טופס inline: שם, טלפון, מייל
- שדה "נושא הפגישה" (חובה לייעוץ בלבד)
- זיהוי חזרה: כשמקלידים שם פונה קיים — הצעה לבחירה

### שלב 4: מיני-כרטיס בדיאלוג פגישה ביומן
- **קובץ:** `src/components/calendar/session-detail-dialog.tsx`
- הצגת נושא, טלפון, פגישות קודמות
- כפתור "הפוך למטופל קבוע" (ב-SCHEDULED וב-COMPLETED)
- כפתור "קבע פגישה חדשה" (ניווט עם `?client=`)

### שלב 5: תצוגה ביומן
- **קובץ:** `src/components/calendar/calendar-event-content.tsx`
- הנושא לא מוצג על המשבצת (הוסר — רק בדיאלוג)

### שלב 6: סקשן ייעוץ בדף מטופלים
- **קובץ:** `src/components/clients/consultation-clients-section.tsx` (קומפוננטה חדשה)
- **קובץ:** `src/app/(dashboard)/dashboard/clients/page.tsx` — סינון `isQuickClient: false` למטופלים רגילים, שליפת quickClients בנפרד
- באנר שדרוג בדף מטופל בודד (`?upgrade=true`)

### שלב 7: סינון בדף פגישות
- **קובץ:** `src/components/sessions/sessions-view.tsx` — כפתור "פגישות ייעוץ בלבד"
- **קובץ:** `src/app/(dashboard)/dashboard/sessions/page.tsx` — topic + isQuickClient בנתונים

### hooks שעודכנו:
- `src/hooks/use-calendar-data.ts` — CalendarClient.isQuickClient, CalendarSession.topic
- `src/hooks/use-clients.ts` — Client.isQuickClient

### types שעודכנו:
- `src/types/index.ts` — TherapySession.topic, SessionFormData.topic

---

## מה צריך לתקן עכשיו — 3 משימות

### נקודת חזרה: commit `7fb0fc5`

---

### תיקון 1 — באג קריטי: בחירת פונה מוכר לא עובדת

**קובץ:** `src/components/calendar/new-session-dialog.tsx`

**הבעיה:**
כשמקלידים שם של פונה שכבר קיים במערכת, מופיעה הודעה "כבר קיים/ת במערכת — לחץ כאן לבחירה". כשלוחצים:
1. `setIsQuickClientMode(false)` נקרא — הטופס של ייעוץ נסגר
2. השם לא מופיע ב-Select הרגיל
3. שדה הנושא נעלם (כי `isQuickClientMode` הפך ל-false)
4. הפגישה לא נוצרת בפועל

**הפתרון — 3 שינויים:**

**א. onClick של "לחץ כאן לבחירה" (בערך שורה 411):**
במקום:
```javascript
setIsQuickClientMode(false);
setQuickClientName("");
setQuickClientPhone("");
setQuickClientEmail("");
```
לשנות ל:
```javascript
// נשארים במצב ייעוץ — לא setIsQuickClientMode(false)
setQuickClientName(matchedClient.name);
setQuickClientPhone(matchedClient.phone || "");
setQuickClientEmail(matchedClient.email || "");
// matchedClient נשאר — הודעת "כבר קיים" ממשיכה להיות מוצגת
```
גם `setFormData` צריך לשמור clientId ומחיר (זה כבר קיים).

**ב. שדות שם/טלפון/מייל — readonly אחרי בחירה:**
כשיש `formData.clientId` (פונה נבחר) — השדות הופכים ל-readonly/disabled עם הערכים של הפונה.
תנאי: `formData.clientId && isQuickClientMode` → שדות disabled

**ג. submit — לא ליצור client חדש אם כבר נבחר:**
בשורה ~174, התנאי הנוכחי:
```javascript
if (isQuickClientMode && !matchedClient) {
  // יוצר client חדש
}
```
לשנות ל:
```javascript
if (isQuickClientMode && !formData.clientId) {
  // יוצר client חדש — רק אם לא נבחר פונה קיים
}
```

---

### תיקון 2 — עיצוב מחדש של סקשן ייעוץ בדף מטופלים

**קובץ:** `src/components/clients/consultation-clients-section.tsx` — כתיבה מחדש

**מצב נוכחי:** שורות ארוכות שגולשות, עיצוב פשוט מדי, אין חיפוש.

**מה צריך:**
1. **כרטיסים (מלבנים) בצבע תכלת** — 4 בשורה (`grid-cols-4`), נמוכים יותר מכרטיסי מטופלים רגילים
2. **לחיצה על כרטיס פונה** → נפתחים מתחתיו **מלבנים קטנים** של פגישות (לא שורות ארוכות)
3. **כל פגישה עם 3 נקודות (⋮)** — תפריט dropdown עם:
   - כניסה לסיכום (`/dashboard/sessions/{id}`)
   - תיקיית מטופל (`/dashboard/clients/{clientId}`)
   - פרטי פגישה
4. **סטטוסים:** להציג **גם** סטטוס פגישה (הושלם/מתוכנן/בוטל) **וגם** סטטוס תשלום (שולם/ממתין/חלקי)
5. **שורת חיפוש** בתוך הסקשן (לפי שם פונה)
6. **מרווח** מהמטופלים הקבועים שמעליו (`mt-8` או דומה)
7. **כותרת סקשן** — collapse/expand כמו היום אבל עם עיצוב יותר נקי

**Props שהקומפוננטה מקבלת (לא לשנות):**
```typescript
interface ConsultationClient {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  sessions: {
    id: string;
    startTime: string;
    status: string;
    topic: string | null;
    paymentStatus: string | null;
  }[];
}
```

---

### תיקון 3 — חיפוש למטופלים קבועים

**קובץ:** `src/app/(dashboard)/dashboard/clients/page.tsx`

**הבעיה:** אין שורת חיפוש לפי שם בדף מטופלים.

**הפתרון:**
הדף הוא server component, אז צריך אחד מהגישות:
- **גישה 1:** ליצור קומפוננטת client wrapper שמקבלת את כל המטופלים ומסננת לפי חיפוש
- **גישה 2:** search param ב-URL (?search=xxx) — סינון בצד השרת

הגישה הפשוטה יותר: קומפוננטת client עם Input שמסננת את הרשימה.

---

## כללי עבודה חשובים (מהזיכרון)

1. **commit לפני כל שינוי** — נקודת חזרה
2. **3 סוכנים מקבילים** לפני כל push (קוד, סנכרון, חוויית משתמש)
3. **build חייב לעבור** אחרי כל שינוי
4. **כל הטקסטים בעברית** — סטטוסים, שגיאות, labels
5. **שינוי אחד בכל פעם** — commit קטן עם הודעה בעברית
6. **לא לגעת בקבצים שלא ביקשו**
7. **עבודה ישירה על main**

---

## commits שנעשו (לפי סדר):

```
5f50d56 feat(ייעוץ): שלבים 1-2 — סכמה + API
47fecc3 feat(ייעוץ): שלב 3 — דיאלוג יצירת פגישת ייעוץ
a65b813 feat(ייעוץ): שלב 4 — מיני-כרטיס לפגישת ייעוץ
254120e feat(ייעוץ): שלב 5 — הצגת נושא ביומן
fc49ee3 feat(ייעוץ): שלב 5 — תיקון types
092f9a9 feat(ייעוץ): שלב 6 — סקשן ייעוץ + באנר שדרוג
7f8ac84 feat(ייעוץ): שלב 7 — סינון בדף פגישות
7fb0fc5 fix(ייעוץ): 4 תיקונים — כפתור באותה שורה, נושא רק בייעוץ, סינון פונים, הסרת נושא מיומן
```
