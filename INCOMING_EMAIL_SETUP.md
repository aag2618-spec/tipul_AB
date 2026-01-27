# 📬 מדריך הגדרת מיילים נכנסים

## סקירה

המערכת יכולה לקלוט **אוטומטית** מיילים שמטופלים שולחים בחזרה!

כשמטופל לוחץ "השב" על מייל שקיבל, המייל יופיע אוטומטית ב**היסטוריית התקשורת** שלך.

---

## 🎯 איך זה עובד?

```
1. אתה שולח מייל למטופל
   ↓
2. המטופל מקבל מייל מ-onboarding@resend.dev
   ↓
3. המטופל לוחץ "השב" ומשיב
   ↓
4. Gmail/Outlook שלך מקבל את המייל
   ↓
5. Forward אוטומטי שולח את זה למערכת
   ↓
6. המערכת מזהה מאיזה מטופל זה ושומר את זה
   ↓
7. אתה מקבל התראה ורואה את המייל בהיסטוריה!
```

---

## 🚀 הגדרה ב-3 שלבים פשוטים

### **שלב 1: צור Webhook Secret**

#### Windows (PowerShell):
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

#### Mac/Linux:
```bash
openssl rand -base64 32
```

📋 שמור את התוצאה - זה ה-`INCOMING_EMAIL_SECRET`

---

### **שלב 2: הוסף ב-Render**

1. כנס ל-[Render Dashboard](https://dashboard.render.com)
2. בחר את ה-Service שלך
3. לך ל-**Environment**
4. לחץ **Add Environment Variable**
5. הוסף:
   ```
   Key: INCOMING_EMAIL_SECRET
   Value: [המחרוזת שיצרת]
   ```
6. **Save Changes**

---

### **שלב 3: הגדר Forward ב-Gmail**

#### אופציה A: Forward כל המיילים מ-Resend (מומלץ)

1. **כנס ל-Gmail**
2. לחץ על ⚙️ **Settings** (למעלה מימין)
3. לחץ **See all settings**
4. לך ל-Tab **Forwarding and POP/IMAP**
5. ב-**Forwarding** לחץ **Add a forwarding address**
6. הוסף:
   ```
   incoming@your-app.onrender.com
   ```
   (במקום your-app - שם ה-app שלך ב-Render)
7. Gmail ישלח מייל אימות → לחץ על הקישור
8. חזור ל-Settings ובחר **Forward a copy of incoming mail to...**

---

#### אופציה B: Filter חכם (רק מיילים מהמטופלים)

1. **כנס ל-Gmail**
2. לחץ על 🔍 בשורת החיפוש
3. לחץ **Show search options**
4. **From:** השאר ריק
5. **Subject:** `RE:` או `Fwd:`
6. לחץ **Create filter**
7. בחר ✅ **Forward it to** → `incoming@your-app.onrender.com`
8. **Create filter**

---

### **שלב 4 (אופציונלי): הגדר ב-Outlook**

1. כנס ל-**Outlook.com** או **Outlook App**
2. לך ל-⚙️ **Settings** → **View all Outlook settings**
3. **Mail** → **Forwarding**
4. הפעל forwarding ל:
   ```
   incoming@your-app.onrender.com
   ```
5. **Save**

---

## 📱 איך להשתמש?

### צפייה במיילים נכנסים:

1. נווט ל-**היסטוריית תקשורת**
2. **סנן לפי:** "תגובות מהמטופלים"
3. תראה מייל עם Badge כחול: **"התקבל מהמטופל" 📬**

### הודעות:

כשמטופל משיב, תקבל **התראה**:
```
📬 תגובה מ-יוסי כהן
נושא: RE: תזכורת לפגישה
```

---

## 🔧 הגדרות מתקדמות

### שינוי כתובת ה-Webhook

במקום `incoming@your-app.onrender.com`, תוכל להשתמש ב:

**Zapier/Make.com:**
```
1. צור Zap/Scenario חדש
2. Trigger: Email (Webhook)
3. Action: HTTP Request POST
4. URL: https://your-app.onrender.com/api/email/incoming
5. Headers: 
   Authorization: Bearer YOUR_INCOMING_EMAIL_SECRET
6. Body: JSON עם from, subject, html
```

---

## 🧪 בדיקה

### בדיקה ידנית:

שלח בעצמך מייל למטופל, ואז השב עליו מחשבון אחר.

### בדיקה עם cURL:

```bash
curl -X POST https://your-app.onrender.com/api/email/incoming \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "test@example.com",
    "subject": "RE: Test",
    "text": "This is a test reply",
    "html": "<p>This is a test reply</p>"
  }'
```

---

## ❓ פתרון בעיות

### המיילים לא מגיעים למערכת

**בדוק:**
1. ✅ Forward מופעל ב-Gmail/Outlook?
2. ✅ `INCOMING_EMAIL_SECRET` הוגדר ב-Render?
3. ✅ המטופל קיים במערכת עם מייל תקין?
4. ✅ ה-Webhook URL נכון?

### איך לראות logs?

**ב-Render:**
1. לך ל-**Logs**
2. חפש "Incoming email"
3. תראה אם המיילים מגיעים

---

## 🎉 סיכום

✅ **Forward אוטומטי** - מיילים מגיעים אוטומטית למערכת  
✅ **זיהוי חכם** - המערכת מזהה מאיזה מטופל המייל  
✅ **התראות** - תקבל התראה כשמטופל משיב  
✅ **היסטוריה מלאה** - כל שיחה במקום אחד

---

## 💡 טיפים

1. **שמור כל המיילים** - כדאי להשאיר את Gmail/Outlook לשמור העתקים
2. **סנן בחוכמה** - אם יש הרבה מיילים, צור filter ספציפי ל-`noreply@resend.dev`
3. **בדוק מדי פעם** - עבור על ההיסטוריה לוודא שהכל עובד

---

## 🔒 אבטחה

המערכת מאובטחת עם:
- ✅ **Webhook Secret** - רק מיילים עם Secret נכון נקלטים
- ✅ **אימות מטופלים** - רק מטופלים רשומים
- ✅ **Logging מלא** - כל מייל נרשם עם timestamp

---

**מוכן? התחל להגדיר עכשיו!** 🚀
