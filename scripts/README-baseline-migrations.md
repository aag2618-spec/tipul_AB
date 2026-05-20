# 📖 הוראות הפעלת `baseline-render-migrations.ps1`

## מה זה עושה?

מסמן את כל ה-Prisma migrations הקיימות בקוד כ-"applied" ב-DB של Render —
**בלי לשנות את ה-DB עצמו**. רק מעדכן טבלה פנימית של prisma.

זה צעד מקדים נדרש לפני המעבר מ-`prisma db push` ל-`prisma migrate deploy`.

---

## 🔐 לפני שמתחילים — חובה!

### צעד 1: גיבוי ה-DB
1. פתח [Render Dashboard](https://dashboard.render.com)
2. בחר את ה-Database service (`tipul-db` או דומה)
3. לשונית **Backups**
4. לחץ **"Backup Now"** ↓
5. חכה ~30 שניות עד שהגיבוי מסומן כ-`Completed`

### צעד 2: השג את ה-DATABASE_URL החיצוני
1. ב-Render Dashboard → אותו Database service
2. גלול למטה ל-**"Connections"**
3. חפש **"External Database URL"** (לא Internal!)
4. לחץ על העין 👁 כדי לראות
5. **העתק** את כל ה-URL (התחלה: `postgres://...`)

⚠️ **חשוב:** External URL, לא Internal. ההבדל: Internal עובד רק מתוך Render עצמו (וזה השרת שהshell שלך לא מצליח להתחבר אליו!), External עובד גם מהמחשב שלך.

---

## 🚀 הפעלה

### צעד 3: פתח PowerShell במחשב שלך
1. במחשב Windows — לחץ Win+R → הקלד `powershell` → Enter
2. נווט לתיקיית הפרויקט:
   ```powershell
   cd "C:\Users\User\Documents\tipul_AB\tipul_AB-main"
   ```

### צעד 4: הרצת dry-run (בדיקה ללא שינוי)
```powershell
.\scripts\baseline-render-migrations.ps1 -DatabaseUrl "postgres://..." -DryRun
```
החלף `postgres://...` ב-URL שהעתקת.

זה **לא יבצע שינויים** — רק יראה לך מה הוא היה עושה.

### צעד 5: אם ה-dry-run נראה תקין, הרץ באמת
```powershell
.\scripts\baseline-render-migrations.ps1 -DatabaseUrl "postgres://..."
```

הסקריפט:
1. ✅ יראה לך את 19 ה-migrations שהוא הולך לסמן
2. ⚠️ ישאל אם עשית גיבוי — כתוב `yes`
3. ⚠️ ישאל אישור סופי — כתוב `apply`
4. 🔄 ירוץ על כל migration
5. ✅ יסכם כמה הצליחו

---

## ✅ אחרי שהסתיים

הסקריפט יציע לך לבדוק:
```powershell
$env:DATABASE_URL = "postgres://..."
npx prisma migrate status
```

מצופה לראות:
```
Database schema is up to date!
```

אם רואה את זה — **שלח לי הודעה** ב-Claude (פתח צ'אט חדש, או המשך הקיים) ותגיד:
> "סיימתי baseline migrations, prisma migrate status מחזיר up to date"

אז אני אחליף את `render.yaml` + `package.json` לעבור ל-`migrate deploy`.

---

## ❌ אם משהו השתבש

**אם יש שגיאות:**
1. **אל תפניק** — הסקריפט הוא קריאה לטבלה פנימית, לא משנה את ה-DB
2. שמור screenshot של הפלט
3. שלח לי הודעה עם ה-screenshot
4. אם חרדה — שחזר מהגיבוי שעשית בצעד 1

---

## 🆘 שאלות נפוצות

### "הסקריפט שואל אותי לאשר policy execution"
```powershell
# הרץ פעם אחת:
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
# אז הרץ שוב את הסקריפט
```

### "npx prisma לא נמצא"
ודא שאתה ב-תיקיית הפרויקט (יש `package.json`):
```powershell
cd "C:\Users\User\Documents\tipul_AB\tipul_AB-main"
```

### "Connection timeout / Can't reach database"
ה-URL הוא Internal, לא External. תחזור ל-Render Dashboard ותעתיק את ה**External** URL.

### "Already migrated" לכל מיגרציה
מצוין! זה אומר שכבר רץ קודם. אפשר לבדוק `npx prisma migrate status`.

---

**זמן משוער: 5 דקות (כולל גיבוי).**
