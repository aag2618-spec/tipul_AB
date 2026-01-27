# 📧 מדריך הקמת מערכת המיילים

## סקירה כללית

מערכת המיילים שלך כוללת:
- ✅ שליחת מיילים למטופלים בודדים
- ✅ שליחה קבוצתית למספר מטופלים
- ✅ תבניות מיילים מוכנות
- ✅ תצוגה מקדימה לפני שליחה
- ✅ היסטוריית תקשורת מלאה
- ✅ התראות בזמן אמת
- ✅ תזכורות אוטומטיות (24 שעות ו-2 שעות)

---

## שלב 1: הרשמה ל-Resend

### 1.1 צור חשבון
1. גש ל-[Resend.com](https://resend.com)
2. הירשם בחינם (100 מיילים ביום)
3. אשר את המייל

### 1.2 קבל API Key
1. התחבר ל-Dashboard
2. לחץ על **API Keys**
3. לחץ **Create API Key**
4. העתק את ה-Key (יתחיל ב-`re_`)

---

## שלב 2: הגדרת הפרויקט

### 2.1 צור קובץ .env.local
העתק את `.env.example` ל-`.env.local`:

```bash
cp .env.example .env.local
```

### 2.2 הוסף את ה-API Key
פתח את `.env.local` והדבק את ה-API Key:

```env
RESEND_API_KEY="re_your_api_key_here"
EMAIL_FROM="Tipul App <onboarding@resend.dev>"
```

**⚠️ חשוב:** בשלב ה-Sandbox, אתה יכול לשלוח רק ל:
- `onboarding@resend.dev` (מייל ברירת מחדל)
- מיילים שתוסיף ידנית ב-Resend Dashboard

---

## שלב 3: אימות דומיין (אופציונלי אבל מומלץ)

### 3.1 למה לאמת דומיין?
- שלח למי שתרצה (לא רק sandbox)
- מיילים לא יגיעו לספאם
- מראה מקצועי יותר

### 3.2 איך לאמת?
1. ב-Resend Dashboard, לך ל-**Domains**
2. לחץ **Add Domain**
3. הקלד את הדומיין שלך (למשל: `yourdomain.com`)
4. הוסף את רשומות ה-DNS ב-GoDaddy/Namecheap/Cloudflare:
   - רשומת SPF
   - רשומת DKIM
   - רשומת DMARC
5. חכה 24-48 שעות לאימות

### 3.3 עדכן את EMAIL_FROM
לאחר האימות, עדכן ב-`.env.local`:

```env
EMAIL_FROM="שם שלך <hello@yourdomain.com>"
```

---

## שלב 4: הגדרת תזכורות אוטומטיות (Cron Jobs)

התוכנה תומכת בתזכורות אוטומטיות, אבל צריך להפעיל אותן.

### 4.1 עם Render (אם אתה מפרסם שם)

בקובץ `render.yaml`, הוסף:

```yaml
services:
  # ... השירות הקיים שלך ...

  - type: cron
    name: reminder-24h
    schedule: "0 * * * *" # כל שעה
    dockerfilePath: ./Dockerfile
    dockerContext: ./
    envVars:
      - key: CRON_SECRET
        sync: false
    command: curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.onrender.com/api/cron/reminders

  - type: cron
    name: reminder-2h
    schedule: "*/15 * * * *" # כל 15 דקות
    dockerfilePath: ./Dockerfile
    dockerContext: ./
    envVars:
      - key: CRON_SECRET
        sync: false
    command: curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.onrender.com/api/cron/reminders-2h
```

### 4.2 עם EasyCron (אלטרנטיבה חינמית)

1. הירשם ל-[EasyCron.com](https://www.easycron.com)
2. צור Cron Job חדש:
   - **URL:** `https://your-app.com/api/cron/reminders`
   - **זמן:** כל שעה (`0 * * * *`)
   - **Header:** `Authorization: Bearer your-cron-secret`
3. צור Cron Job נוסף:
   - **URL:** `https://your-app.com/api/cron/reminders-2h`
   - **זמן:** כל 15 דקות (`*/15 * * * *`)
   - **Header:** `Authorization: Bearer your-cron-secret`

### 4.3 צור CRON_SECRET

```bash
openssl rand -base64 32
```

הוסף ל-`.env.local`:

```env
CRON_SECRET="the-generated-secret"
```

---

## שלב 5: בדיקה

### 5.1 בדוק שהכל עובד

1. הפעל את השרת:
   ```bash
   npm run dev
   ```

2. היכנס למערכת

3. נווט לדף מטופל עם מייל

4. לחץ על **שלח מייל**

5. כתוב מייל קצר ושלח

6. בדוק:
   - האם קיבלת התראה?
   - האם המייל מופיע ב-**היסטוריית תקשורת**?
   - האם המייל הגיע? (בדוק ב-Resend Dashboard → Logs)

### 5.2 בדוק שליחה קבוצתית

1. נווט ל-**היסטוריית תקשורת**

2. לחץ **שליחה קבוצתית**

3. בחר 2-3 מטופלים

4. שלח מייל

5. בדוק שהכל הגיע

---

## שלב 6: שימוש יומיומי

### איך לשלוח מייל למטופל?

1. **מעמוד המטופל:**
   - נווט למטופל
   - לחץ **שלח מייל**
   - בחר תבנית או כתוב חופשי
   - לחץ **תצוגה מקדימה** לפני שליחה
   - שלח!

2. **שליחה קבוצתית:**
   - נווט ל-**היסטוריית תקשורת**
   - לחץ **שליחה קבוצתית**
   - בחר מטופלים
   - כתוב הודעה (השתמש ב-`{name}` לשם אישי)
   - שלח!

### איך לעקוב אחרי מיילים?

1. נווט ל-**היסטוריית תקשורת**
2. תראה:
   - ✅ מיילים שנשלחו
   - ❌ מיילים שנכשלו
   - 🕐 מיילים ממתינים
3. לחץ **צפה** כדי לראות את המייל המלא

### תבניות מיילים

התוכנה כוללת תבניות מוכנות:
- **תזכורת לפגישה**
- **תודה על הפגישה**
- **ביטול פגישה**
- **שליחת משאבים**
- **מעקב אחרי פגישה**
- **ברכת חג** (בשליחה קבוצתית)

---

## בעיות נפוצות

### המיילים לא מגיעים

**בדוק:**
1. ה-API Key תקין?
2. אתה ב-Sandbox mode? (אז צריך להוסיף מיילים ב-Resend)
3. המייל לא בספאם?
4. בדוק ב-Resend Dashboard → Logs

### המיילים מגיעים לספאם

**פתרון:**
- אמת את הדומיין שלך
- הוסף SPF, DKIM, DMARC records

### שגיאה "RESEND_API_KEY not set"

**פתרון:**
1. בדוק שיש `.env.local` (לא `.env.example`)
2. בדוק שה-Key מתחיל ב-`re_`
3. הפעל מחדש את השרת

### התזכורות לא נשלחות

**פתרון:**
1. בדוק שהגדרת Cron Jobs
2. בדוק שה-`CRON_SECRET` תואם
3. בדוק ב-Logs של Render/EasyCron

---

## סטטיסטיקות

בעמוד **היסטוריית תקשורת** תראה:
- 📧 סה"כ הודעות
- ✅ נשלחו בהצלחה
- ❌ נכשלו
- 🕐 ממתינים

---

## תמיכה

אם יש בעיות:
1. בדוק את ה-Console בדפדפן (F12)
2. בדוק את Logs ב-Resend Dashboard
3. בדוק את הקובץ `.env.local`

---

## 🎉 מזל טוב!

מערכת המיילים שלך מוכנה!

**מה הלאה?**
- שלח את המייל הראשון שלך
- נסה את השליחה הקבוצתית
- אמת את הדומיין שלך למיילים מקצועיים

**טיפים:**
- השתמש ב-`{name}` למיילים אישיים
- בדוק תמיד את התצוגה המקדימה
- עקוב אחרי ההיסטוריה
