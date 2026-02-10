# הגדרת Cron Jobs במערכת

## 📋 רשימת Cron Jobs

המערכת תומכת ב-5 Cron Jobs אוטומטיים:

### 1. תזכורות פגישה (48 שעות לפני)
- **נתיב:** `/api/cron/reminders`
- **תדירות:** כל שעה
- **תיאור:** שולח תזכורת למטופלים 48 שעות לפני פגישה

### 2. תזכורות פגישה (2 שעות לפני)
- **נתיב:** `/api/cron/reminders-2h`
- **תדירות:** כל שעה
- **תיאור:** שולח תזכורת למטופלים 2 שעות לפני פגישה

### 3. התראות כלליות
- **נתיב:** `/api/cron/notifications`
- **תדירות:** כל שעה
- **תיאור:** מעבד התראות מערכת

### 4. 🆕 תזכורות חוב חודשיות
- **נתיב:** `/api/cron/debt-reminders`
- **תדירות:** **יומית בשעה 09:00**
- **תיאור:** בודק אם היום תואם ליום שהוגדר בהגדרות, ושולח תזכורות חוב אוטומטיות

### 5. 🆕 תזכורות מנוי אוטומטיות
- **נתיב:** `/api/cron/subscription-reminders`
- **תדירות:** **יומית בשעה 09:00**
- **תיאור:** שולח תזכורות מנוי למנויים (7 ימים, 3 ימים, יום אחרון), מנהל תקופת חסד, ושולח הודעות לאדמין

---

## 🔧 הגדרת Cron Jobs ב-Render

### שלב 1: הוסף משתנה סביבה `CRON_SECRET`

1. היכנס ל-[Render Dashboard](https://dashboard.render.com/)
2. בחר את השירות שלך
3. לך ל-**Environment** → **Environment Variables**
4. הוסף משתנה חדש:
   - **Key:** `CRON_SECRET`
   - **Value:** מחרוזת אקראית חזקה (לדוגמה: `generate-strong-secret-123456`)
   - 💡 **טיפ:** השתמש ב-[Password Generator](https://passwordsgenerator.net/) ליצירת מחרוזת חזקה

### שלב 2: הגדר Cron Jobs ב-Render

1. ב-Render Dashboard, לך ל-**Settings** → **Cron Jobs**
2. לחץ על **Add Cron Job**

#### הגדרת תזכורות חוב (חדש!)

```
Name: Debt Reminders
Schedule: 0 9 * * *
Command: curl -X GET https://YOUR-APP-URL.onrender.com/api/cron/debt-reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**הסבר Schedule:**
- `0 9 * * *` = כל יום בשעה 09:00 UTC (11:00 בישראל)
- אם רוצה שעה אחרת: `0 H * * *` (החלף H בשעה רצויה ב-UTC)

#### 🆕 הגדרת תזכורות מנוי

```
Name: Subscription Reminders
Schedule: 0 9 * * *
Command: curl -X GET https://YOUR-APP-URL.onrender.com/api/cron/subscription-reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**מה זה עושה?**
- 📧 שולח תזכורת למנוי 7 ימים / 3 ימים / יום אחרון לפני פקיעת המנוי
- 🚨 שולח תזכורות בתקופת חסד (7 ימים אחרי פקיעה)
- ❌ חוסם מנויים שתקופת החסד נגמרה
- 📋 שולח מייל לאדמין על כל מצב (תשלום התקבל / נכשל / מנוי נחסם)

#### הגדרת תזכורות פגישה 48 שעות

```
Name: Session Reminders 48h
Schedule: 0 * * * *
Command: curl -X GET https://YOUR-APP-URL.onrender.com/api/cron/reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

#### הגדרת תזכורות פגישה 2 שעות

```
Name: Session Reminders 2h
Schedule: 0 * * * *
Command: curl -X GET https://YOUR-APP-URL.onrender.com/api/cron/reminders-2h \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

#### הגדרת התראות

```
Name: Notifications
Schedule: 0 * * * *
Command: curl -X GET https://YOUR-APP-URL.onrender.com/api/cron/notifications \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## 🔐 אבטחה

כל ה-Cron Jobs דורשים אימות באמצעות `CRON_SECRET`:

```bash
Authorization: Bearer YOUR_CRON_SECRET
```

❌ **ללא ה-header הזה, הבקשה תידחה עם 401 Unauthorized**

---

## ⏰ Cron Schedule Format

```
* * * * *
│ │ │ │ │
│ │ │ │ └─── יום בשבוע (0-6, 0=ראשון)
│ │ │ └───── חודש (1-12)
│ │ └─────── יום בחודש (1-31)
│ └───────── שעה (0-23)
└─────────── דקה (0-59)
```

### דוגמאות נפוצות:

- `0 * * * *` - כל שעה בדיוק
- `0 9 * * *` - כל יום בשעה 09:00
- `0 9 1 * *` - ה-1 לחודש בשעה 09:00
- `*/15 * * * *` - כל 15 דקות
- `0 */6 * * *` - כל 6 שעות

---

## 📊 כיצד עובדות תזכורות החוב?

1. **הגדרה בממשק:**
   - המטפל נכנס ל-**הגדרות** → **תקשורת**
   - מפעיל **תזכורות חוב אוטומטיות**
   - בוחר **יום בחודש** (לדוגמה: 1, 15, או 28)
   - קובע **סכום מינימלי** (לדוגמה: ₪50)

2. **הרצה יומית:**
   - ה-Cron רץ **כל יום** בשעה 09:00
   - בודק: האם היום בחודש = היום שהוגדר?
   - אם כן → ממשיך לשלב הבא
   - אם לא → יוצא מייד

3. **זיהוי מטופלים:**
   - מחפש מטופלים עם חוב **מעל הסכום המינימלי**
   - רק למטופלים עם **כתובת מייל תקינה**

4. **שליחת מיילים:**
   - שולח מייל מפורט עם:
     - ✅ רשימת כל הפגישות שלא שולמו
     - ✅ תאריך, סוג, וסטטוס כל פגישה
     - ✅ סכום חוב כולל
   - רושם ב-**לוג התקשורת**
   - יוצר **התראה למטפל**

---

## 🧪 בדיקה ידנית

אפשר לבדוק ידנית כל Cron Job:

### Linux/Mac:
```bash
curl -X GET https://YOUR-APP-URL.onrender.com/api/cron/debt-reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Windows (PowerShell):
```powershell
$headers = @{ "Authorization" = "Bearer YOUR_CRON_SECRET" }
Invoke-WebRequest -Uri "https://YOUR-APP-URL.onrender.com/api/cron/debt-reminders" `
  -Headers $headers -Method GET
```

### תשובה מצופה:
```json
{
  "message": "Debt reminders processed",
  "dayOfMonth": 15,
  "therapistsProcessed": 1,
  "clientsProcessed": 3,
  "emailsSent": 3
}
```

---

## 🐛 Troubleshooting

### Cron לא רץ?
1. ✅ בדוק שה-`CRON_SECRET` מוגדר נכון
2. ✅ בדוק שה-Schedule נכון (זמן UTC!)
3. ✅ בדוק ב-Render Logs אם יש שגיאות

### מיילים לא נשלחים?
1. ✅ בדוק שה-`RESEND_API_KEY` מוגדר
2. ✅ בדוק שלמטופלים יש כתובות מייל
3. ✅ בדוק ב-**לוג התקשורת** את הסטטוס

### תזכורות חוב לא עובדות?
1. ✅ בדוק ב-**הגדרות תקשורת** שההגדרות פעילות
2. ✅ בדוק שהיום בחודש תואם
3. ✅ בדוק שיש מטופלים עם חוב מעל הסכום המינימלי

---

## 📝 Logs

כל ריצה של Cron מתועדת ב-Render Logs.

לצפייה:
1. Render Dashboard → Your Service
2. **Logs** tab
3. חפש: `[Debt Reminders Cron]`

דוגמה ללוג:
```
[Debt Reminders Cron] Running for day 15 of month
[Debt Reminders Cron] Found 1 therapists with reminders enabled
[Debt Reminders Cron] Processing therapist Dr. Cohen (min amount: ₪50)
[Debt Reminders Cron] Sending to John Doe - debt ₪450
[Debt Reminders Cron] Completed: {"emailsSent": 1, "clientsProcessed": 1}
```

---

## ✅ Checklist לפני השקה

- [ ] `CRON_SECRET` מוגדר ב-Environment Variables
- [ ] `RESEND_API_KEY` מוגדר ופעיל
- [ ] `ADMIN_EMAIL` מוגדר (המייל שלך - לקבלת הודעות על מנויים)
- [ ] כל 5 ה-Cron Jobs מוגדרים ב-Render
- [ ] בדיקה ידנית עבדה
- [ ] הגדרות תזכורת חוב מוגדרות נכון בממשק
- [ ] בדוק את ה-Logs אחרי ריצה ראשונה

---

💡 **טיפ:** המלצה להגדיר תזכורות חוב ל-**1 לחודש** או **15 לחודש** (אמצע החודש).
