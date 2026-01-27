# 🕐 מדריך הפעלת תזכורות אוטומטיות

## סקירה מהירה

התוכנה כוללת שתי מערכות תזכורות מובנות:
- ✅ תזכורת **24 שעות לפני** הפגישה
- ✅ תזכורת **2 שעות לפני** הפגישה

---

## שלב 1: צור CRON_SECRET

### Windows (PowerShell):
```powershell
# צור מחרוזת אקראית:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### Mac/Linux:
```bash
openssl rand -base64 32
```

📋 **העתק את התוצאה** - זה ה-CRON_SECRET שלך

---

## שלב 2: הוסף ב-Render

1. כנס ל-[Render Dashboard](https://dashboard.render.com)
2. בחר את ה-Service שלך (tipul_AB)
3. לך ל-**Environment** (בתפריט צד)
4. לחץ **Add Environment Variable**
5. הוסף:
   ```
   Key: CRON_SECRET
   Value: [המחרוזת שיצרת]
   ```
6. לחץ **Save Changes**

---

## שלב 3: בחר שיטת הפעלה

### **אופציה 1: Render Cron Jobs** (מומלץ אם אתה ב-Paid Plan)

#### תזכורת 24 שעות:
```yaml
Name: reminder-24h
Type: Cron Job
Schedule: 0 * * * *
Command: curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.onrender.com/api/cron/reminders
```

#### תזכורת 2 שעות:
```yaml
Name: reminder-2h
Type: Cron Job
Schedule: */15 * * * *
Command: curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.onrender.com/api/cron/reminders-2h
```

---

### **אופציה 2: EasyCron** (חינם ומומלץ!)

1. **הירשם:** [https://www.easycron.com/user/register](https://www.easycron.com/user/register)
   - תוכנית חינמית: עד 20 Cron Jobs

2. **צור Job ראשון (תזכורת 24 שעות):**
   - לחץ **+ Add Cron Job**
   - **URL to call:**
     ```
     https://your-app.onrender.com/api/cron/reminders
     ```
   - **Cron Expression:** `0 * * * *` (כל שעה)
   - **HTTP Method:** GET
   - **HTTP Headers:** (לחץ Add Header)
     ```
     Authorization: Bearer YOUR_CRON_SECRET
     ```
   - לחץ **Create Cron Job**

3. **צור Job שני (תזכורת 2 שעות):**
   - לחץ **+ Add Cron Job**
   - **URL to call:**
     ```
     https://your-app.onrender.com/api/cron/reminders-2h
     ```
   - **Cron Expression:** `*/15 * * * *` (כל 15 דקות)
   - **HTTP Method:** GET
   - **HTTP Headers:**
     ```
     Authorization: Bearer YOUR_CRON_SECRET
     ```
   - לחץ **Create Cron Job**

---

### **אופציה 3: cron-job.org** (אלטרנטיבה חינמית)

1. **הירשם:** [https://cron-job.org/en/signup/](https://cron-job.org/en/signup/)

2. **צור Cronjob ראשון:**
   - **Title:** Reminder 24h
   - **URL:** `https://your-app.onrender.com/api/cron/reminders`
   - **Schedule:** Every hour
   - **Request Headers:** (לחץ +)
     ```
     Name: Authorization
     Value: Bearer YOUR_CRON_SECRET
     ```
   - **Save**

3. **צור Cronjob שני:**
   - **Title:** Reminder 2h
   - **URL:** `https://your-app.onrender.com/api/cron/reminders-2h`
   - **Schedule:** Every 15 minutes
   - **Request Headers:**
     ```
     Name: Authorization
     Value: Bearer YOUR_CRON_SECRET
     ```
   - **Save**

---

## שלב 4: בדיקה

### איך לבדוק שזה עובד?

1. **צור פגישה מחר** (בדיוק 24 שעות מעכשיו)
2. **המתן שעה** (או הפעל ידנית)
3. **בדוק:**
   - ✅ המטופל קיבל מייל?
   - ✅ המייל מופיע ב"היסטוריית תקשורת"?
   - ✅ קיבלת התראה?

### בדיקה ידנית (לא לחכות):

```bash
# במקום לחכות, תפעיל ידנית:
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-app.onrender.com/api/cron/reminders
```

---

## הגדרות מתקדמות

### שינוי תוכן התזכורות

הקבצים לעריכה:
- `src/lib/email-templates.ts`

**תזכורת 24 שעות:**
```typescript
export function create24HourReminderEmail(data: EmailTemplateData) {
  return {
    subject: `תזכורת: תור מחר ב-${data.time}`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">שלום ${data.clientName},</h2>
      <p>מזכירים לך שיש לך תור מחר:</p>
      <!-- ערוך כאן -->
    `)
  };
}
```

### הוספת תזכורת שלישית (7 ימים לפני):

1. צור קובץ חדש: `src/app/api/cron/reminders-7d/route.ts`
2. העתק מ-`reminders/route.ts` ושנה את החלון:
   ```typescript
   const reminderWindowStart = new Date(now.getTime() + 167 * 60 * 60 * 1000); // 7 days
   const reminderWindowEnd = new Date(now.getTime() + 169 * 60 * 60 * 1000);
   ```

---

## פתרון בעיות

### התזכורות לא נשלחות

**בדוק:**
1. ✅ ה-CRON_SECRET תואם בין Render ל-Cron Service?
2. ✅ ה-URL נכון? (כולל https://)
3. ✅ יש מטופלים עם כתובת מייל?
4. ✅ יש פגישות מתוזמנות בטווח הזמן?

### איך לראות לוגים?

**ב-EasyCron:**
- כנס ל-**Execution History**
- תראה אם הקריאה הצליחה (Status 200)

**ב-Render:**
- כנס ל-**Logs**
- חפש "Reminders processed"

---

## סיכום

✅ **תזכורת 24 שעות** - רצה כל שעה, בודקת פגישות מחר  
✅ **תזכורת 2 שעות** - רצה כל 15 דקות, בודקת פגישות קרובות  
✅ **התראות** - תקבל התראה כשמייל נשלח  
✅ **היסטוריה** - כל מייל נרשם ונשמר

---

## נספח: Cron Expressions

```
* * * * *  = כל דקה
*/5 * * * * = כל 5 דקות
*/15 * * * * = כל 15 דקות
0 * * * * = כל שעה
0 9 * * * = כל יום ב-9:00
0 9,17 * * * = כל יום ב-9:00 וב-17:00
```

**מחשבון:** [https://crontab.guru/](https://crontab.guru/)
