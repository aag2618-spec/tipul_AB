# 🚀 Quick Start Guide - AI Assistant

## ⚡ התקנה מהירה (5 דקות)

### 1️⃣ Install Dependencies
```bash
npm install
```

### 2️⃣ Add Environment Variable
הוסף לקובץ `.env` בשורש הפרויקט:
```env
OPENAI_API_KEY=sk-proj-your_key_here
```

💡 **איפה מקבלים API Key?**
1. לך ל-[OpenAI Platform](https://platform.openai.com/api-keys)
2. התחבר או הירשם
3. לחץ "Create new secret key"
4. העתק והדבק ל-`.env`

### 3️⃣ Update Database
```bash
npx prisma db push
npx prisma generate
```

### 4️⃣ Migrate Existing Users (Optional)
אם יש לך משתמשים קיימים במערכת:
```bash
npx ts-node scripts/migrate-ai-settings.ts
```

זה יוסיף להם:
- `aiTier: ESSENTIAL` (ברירת מחדל, ללא AI)
- `maxActiveClients: 40`
- הגדרות ברירת מחדל

### 5️⃣ Build & Run
```bash
npm run build
npm start
```

או לפיתוח:
```bash
npm run dev
```

---

## ✅ בדיקה שהכל עובד

### 1. כניסה למערכת
התחבר כמנהל (user עם `role: "ADMIN"`).

### 2. בדוק Admin Dashboard
לך ל: **ניהול מערכת → AI Usage**

אמור להראות:
- ✅ סטטיסטיקות משתמשים
- ✅ חלוקה לפי תוכניות
- ✅ הגדרות גלובליות

### 3. בדוק הגדרות AI
לך ל: **הגדרות → AI Assistant**

אמור להראות:
- ✅ הודעה על Essential plan (צריך לשדרג)
- ✅ תיאור של הפיצ'רים
- ✅ כפתור "שדרג"

### 4. בדוק AI Prep (אם יש Pro/Enterprise)
לך ל: **AI Session Prep** (בסיידבר)

---

## 🎯 שדרוג משתמש ל-Pro/Enterprise

כדי לבדוק את ה-AI בפועל, שדרג משתמש ידנית:

### דרך 1: Prisma Studio
```bash
npx prisma studio
```

1. פתח את טבלת `User`
2. מצא את המשתמש שלך
3. שנה `aiTier` ל-`PRO` או `ENTERPRISE`
4. שמור

### דרך 2: SQL ישיר
```sql
UPDATE "User" 
SET "aiTier" = 'PRO' 
WHERE "email" = 'your-email@example.com';
```

---

## 🧪 בדיקת AI Session Prep

אחרי שדרוג ל-Pro/Enterprise:

1. **הגדר גישות טיפוליות**:
   - לך ל: **הגדרות → AI Assistant**
   - בחר לפחות גישה אחת (למשל: CBT)
   - שמור

2. **צור פגישה עם סיכום**:
   - לך למטופל כלשהו
   - צור פגישה שהושלמה
   - כתוב סיכום לפגישה

3. **בדוק Session Prep**:
   - לך ל: **AI Session Prep**
   - לחץ "צור Session Prep" על פגישה
   - תוך 3-5 שניות תקבל briefing מקצועי! ✨

---

## 🐛 בעיות נפוצות

### "OPENAI_API_KEY is not configured"
❌ **בעיה:** ה-API key חסר או לא נטען

✅ **פתרון:**
1. בדוק שיש `.env` בשורש הפרויקט
2. בדוק ש-`OPENAI_API_KEY=sk-...` קיים
3. אם ב-Render: הוסף Environment Variable
4. Restart הסרבר

### "User not found" או "Unauthorized"
❌ **בעיה:** Session לא תקין

✅ **פתרון:**
1. התנתק והתחבר שוב
2. נקה cookies
3. בדוק שה-user קיים בדאטהבייס

### Table/Component not found
❌ **בעיה:** Component חסר

✅ **פתרון:**
```bash
npm install
npx prisma generate
```

### Prisma errors
❌ **בעיה:** Schema לא מעודכן

✅ **פתרון:**
```bash
npx prisma generate
npx prisma db push --accept-data-loss
```

---

## 📖 תיעוד מלא

- **IMPLEMENTATION_SUMMARY.md** - סיכום מפורט של מה נוסף
- **AI_ASSISTANT_README.md** - מדריך שלם ומקיף
- **prisma/schema.prisma** - Schema המלא

---

## 🎉 הצלחה!

אם הכל עובד, אתה אמור לראות:
- ✅ סיידבר עם "AI Session Prep"
- ✅ הגדרות AI Assistant
- ✅ Admin Dashboard (למנהלים)
- ✅ AI working! (Pro/Enterprise)

**תהנה מהמערכת החדשה! 🚀**

---

**צריך עזרה?** בדוק את הקבצים:
- `IMPLEMENTATION_SUMMARY.md`
- `AI_ASSISTANT_README.md`
