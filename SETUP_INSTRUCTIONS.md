# 📚 מדריך הגדרה מלא - מערכת תשלומים וקבלות

## 📋 תוכן עניינים

1. [סקירה כללית](#סקירה-כללית)
2. [הגדרת מיילים נכנסים](#הגדרת-מיילים-נכנסים)
3. [הגדרת גביית מנויים (Meshulam)](#הגדרת-גביית-מנויים)
4. [הגדרות Render](#הגדרות-render)
5. [בדיקות](#בדיקות)
6. [שאלות נפוצות](#שאלות-נפוצות)

---

## 🎯 סקירה כללית

### מה נבנה:

| תכונה | תיאור | למי |
|--------|--------|-----|
| **קבלת מיילים** | מטופלים משיבים ואתה רואה במערכת | מטפלים |
| **גביית מנויים** | גביית דמי מנוי אוטומטית | בעל המערכת |
| **גביית מטופלים** | המטפלים גובים מהמטופלים שלהם | מטפלים |
| **הפקת קבלות** | קבלות אוטומטיות אחרי תשלום | כולם |

---

## 📧 הגדרת מיילים נכנסים

### מה זה עושה?
כשמטופל משיב על מייל שקיבל ממך, התשובה תופיע אוטומטית במערכת!

### שלב 1: יצירת מפתח סודי

פתח **PowerShell** והרץ:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

**שמור את התוצאה!** זה ה-`INCOMING_EMAIL_SECRET` שלך.

### שלב 2: הוספה ל-Render

1. היכנס ל-[Render Dashboard](https://dashboard.render.com)
2. בחר את ה-Service שלך (tipul)
3. לך ל-**Environment**
4. לחץ **Add Environment Variable**
5. הוסף:
   ```
   Key: INCOMING_EMAIL_SECRET
   Value: [המחרוזת שיצרת]
   ```
6. לחץ **Save Changes**

### שלב 3: הגדרת Forward ב-Gmail

1. היכנס ל-Gmail שלך
2. לחץ על ⚙️ (הגדרות) → **See all settings**
3. לך ל-Tab **Forwarding and POP/IMAP**
4. לחץ **Add a forwarding address**
5. הזן את הכתובת:
   ```
   your-app-name.onrender.com
   ```
   (החלף ב-URL של האפליקציה שלך)
6. Gmail ישלח מייל אימות - לחץ על הקישור
7. חזור להגדרות ובחר **Forward a copy of incoming mail to...**
8. לחץ **Save Changes**

### שלב 4: בדיקה

1. שלח מייל למטופל מהמערכת
2. בקש ממישהו להשיב על המייל
3. היכנס למערכת → **היסטוריית תקשורת**
4. אתה אמור לראות את התשובה עם תגית 📬 "התקבל מהמטופל"

---

## 💳 הגדרת גביית מנויים

### מה זה עושה?
המטפלים ישלמו לך דמי מנוי חודשיים אוטומטית דרך Meshulam.

### שלב 1: פתיחת חשבון Meshulam

1. היכנס ל-[meshulam.co.il](https://www.meshulam.co.il)
2. לחץ **הרשמה**
3. מלא את הפרטים העסקיים שלך
4. המתן לאישור (1-3 ימי עסקים)

### שלב 2: קבלת API Key

1. היכנס לחשבון Meshulam שלך
2. לך ל-**הגדרות** → **API**
3. העתק את ה-**Page Code**
4. שמור אותו - זה ה-API Key שלך

### שלב 3: יצירת מפתח הצפנה

פתח **PowerShell** והרץ:

```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

**שמור את התוצאה!** זה ה-`ENCRYPTION_KEY` שלך (חייב להיות 32 תווים בדיוק).

### שלב 4: יצירת Webhook Secret

פתח **PowerShell** והרץ:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

**שמור את התוצאה!** זה ה-`MESHULAM_WEBHOOK_SECRET` שלך.

### שלב 5: הוספה ל-Render

1. היכנס ל-[Render Dashboard](https://dashboard.render.com)
2. בחר את ה-Service שלך
3. לך ל-**Environment**
4. הוסף את המשתנים הבאים:

| Key | Value |
|-----|-------|
| `ENCRYPTION_KEY` | המחרוזת בת 32 תווים |
| `MESHULAM_WEBHOOK_SECRET` | המחרוזת שיצרת |
| `MESHULAM_API_KEY` | ה-Page Code מ-Meshulam (לחשבון שלך בלבד) |

5. לחץ **Save Changes**

### שלב 6: הגדרת Webhook ב-Meshulam

1. היכנס לחשבון Meshulam שלך
2. לך ל-**הגדרות** → **Webhooks** (או **התראות**)
3. הוסף Webhook חדש:
   ```
   URL: https://your-app-name.onrender.com/api/webhooks/meshulam
   ```
4. בחר את האירועים:
   - ✅ תשלום התקבל
   - ✅ תשלום נכשל
   - ✅ מנוי חודש
   - ✅ מנוי בוטל
5. שמור

### שלב 7: בדיקה

1. היכנס למערכת כמשתמש חדש
2. תועבר לדף תשלום מנוי
3. שלם בכרטיס בדיקה (Meshulam יספק לך פרטים)
4. וודא שהסטטוס משתנה ל-ACTIVE

---

## ⚙️ הגדרות Render - סיכום

### כל משתני הסביבה שצריך להוסיף:

| משתנה | תיאור | איך ליצור |
|--------|--------|-----------|
| `INCOMING_EMAIL_SECRET` | מפתח לקבלת מיילים | PowerShell: `[Convert]::ToBase64String((1..32 \| ForEach-Object { Get-Random -Maximum 256 }))` |
| `ENCRYPTION_KEY` | מפתח הצפנה (32 תווים) | PowerShell: `-join ((65..90) + (97..122) + (48..57) \| Get-Random -Count 32 \| ForEach-Object {[char]$_})` |
| `MESHULAM_WEBHOOK_SECRET` | סוד לאימות Webhooks | PowerShell: `[Convert]::ToBase64String((1..32 \| ForEach-Object { Get-Random -Maximum 256 }))` |
| `MESHULAM_API_KEY` | ה-Page Code שלך מ-Meshulam | מתוך חשבון Meshulam שלך |

### משתנים שכבר אמורים להיות מוגדרים:

| משתנה | תיאור |
|--------|--------|
| `DATABASE_URL` | חיבור לבסיס הנתונים |
| `NEXTAUTH_SECRET` | מפתח אימות |
| `NEXTAUTH_URL` | כתובת האפליקציה |
| `RESEND_API_KEY` | מפתח שליחת מיילים |

---

## 🔍 בדיקות

### בדיקת מיילים נכנסים:

```bash
# בדיקה עם cURL
curl -X POST https://your-app.onrender.com/api/email/incoming \
  -H "Authorization: Bearer YOUR_INCOMING_EMAIL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "test@example.com",
    "subject": "RE: Test",
    "text": "This is a test reply"
  }'
```

### בדיקת Meshulam Webhook:

```bash
# בדיקה עם cURL
curl -X POST https://your-app.onrender.com/api/webhooks/meshulam \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.success",
    "data": {
      "amount": 150,
      "customerId": "test123"
    }
  }'
```

---

## ❓ שאלות נפוצות

### ש: מה קורה אם לא הגדרתי את המשתנים?
**ת:** המערכת תמשיך לעבוד, אבל התכונות החדשות לא יפעלו. תקבל שגיאות ב-Logs.

### ש: איך אני יודע שזה עובד?
**ת:** 
- מיילים נכנסים: תראה תגית 📬 בהיסטוריית תקשורת
- תשלומים: תראה סטטוס ACTIVE בפאנל אדמין

### ש: מה אם שכחתי את ה-ENCRYPTION_KEY?
**ת:** ⚠️ **חשוב מאוד!** אם תאבד את המפתח, לא תוכל לפענח את ה-API Keys של המטפלים. שמור אותו במקום בטוח!

### ש: האם אני יכול לשנות ספק אחרי שהתחלתי?
**ת:** כן, אבל תצטרך להגדיר מחדש את ה-API Keys ו-Webhooks.

### ש: איך המטפלים מחברים את הספקים שלהם?
**ת:** הם נכנסים ל-**הגדרות** → **אינטגרציות** → לוחצים "התחבר" על הספק הרצוי.

---

## 📞 תמיכה

אם יש בעיה:
1. בדוק את ה-Logs ב-Render
2. וודא שכל משתני הסביבה מוגדרים נכון
3. וודא ש-Webhooks מוגדרים ב-Meshulam

---

**עודכן לאחרונה:** פברואר 2026
