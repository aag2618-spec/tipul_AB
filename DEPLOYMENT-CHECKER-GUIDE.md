# 🚀 מדריך שימוש בסקריפט בדיקת Deployment

## שלב 1: קבלת API Key מ-Render

1. היכנס ל: https://dashboard.render.com/u/settings#api-keys
2. לחץ על **"Create API Key"**
3. תן לו שם: `Deployment Checker`
4. **העתק את ה-key** (הוא מתחיל ב-`rnd_...`)
   ⚠️ **חשוב**: ה-key מוצג רק פעם אחת! שמור אותו במקום בטוח.

## שלב 2: קבלת Service ID

1. היכנס ל: https://dashboard.render.com
2. לחץ על השירות שלך **"tipul"**
3. הסתכל על ה-URL בדפדפן:
   ```
   https://dashboard.render.com/web/srv-XXXXXXXXXXXXX
   ```
4. החלק `srv-XXXXXXXXXXXXX` זה ה-Service ID שלך

## שלב 3: הרצת הסקריפט

### אופציה א': עם משתני סביבה (מומלץ)

```powershell
# הגדר את המשתנים (החלף את הערכים!)
$env:RENDER_API_KEY = "rnd_your_actual_key_here"
$env:RENDER_SERVICE_ID = "srv_your_service_id_here"

# הרץ את הסקריפט
node check-deployment.js
```

### אופציה ב': עריכת הקובץ ישירות

1. פתח את הקובץ `check-deployment.js`
2. מצא את השורות:
   ```javascript
   const RENDER_API_KEY = process.env.RENDER_API_KEY || 'YOUR_API_KEY_HERE';
   const SERVICE_ID = process.env.RENDER_SERVICE_ID || 'YOUR_SERVICE_ID_HERE';
   ```
3. החלף את `YOUR_API_KEY_HERE` ואת `YOUR_SERVICE_ID_HERE` בערכים האמיתיים
4. שמור והרץ:
   ```powershell
   node check-deployment.js
   ```

## 📊 איך זה נראה

הסקריפט יציג:
```
╔════════════════════════════════════════════════╗
║   🚀 בודק Deployment ב-Render                ║
╚════════════════════════════════════════════════╝

🔍 מחפש את ה-deployment האחרון...

📦 Deployment ID: dep-xxxxx
📅 התחיל ב: 24/01/2026, 23:15:34
📊 סטטוס נוכחי: build_in_progress

👀 עוקב אחרי deployment: dep-xxxxx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ [15s] בונה... (build_in_progress)
⏳ [45s] בונה... (build_in_progress)
🔄 [89s] מעדכן...
✅ [125s] הצליח! האתר עלה לאוויר! 🎉

🌐 כתובת: https://your-app.onrender.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ סיימתי!
```

## 🔄 שימוש יומיומי

אחרי ה-push לגיט:
```powershell
git push
node check-deployment.js
```

הסקריפט יעקוב אוטומטית אחרי ה-deployment ויודיע לך כשהוא מסתיים!

## ⚠️ פתרון בעיות

### שגיאת 401/403
- ה-API key לא תקין או פג תוקפו
- צור key חדש ב-Render

### Service not found
- ה-Service ID לא נכון
- בדוק שהעתקת את כל ה-ID כולל `srv-`

### Module not found
- וודא ש-Node.js מותקן:
  ```powershell
  node --version
  ```
