# 🤖 AI Therapy Assistant - Setup Guide

## סיכום מה נוסף

הוספנו למערכת **AI Therapy Assistant** עם מערכת ניהול מלאה!

### ✨ פיצ'רים חדשים:

1. **AI Session Prep** - הכנה חכמה לכל פגישה
2. **Admin Dashboard** - ניהול מלא של שימוש ב-AI
3. **User Settings** - התאמה אישית של AI לפי גישה טיפולית
4. **Billing Integration** - 3 תוכניות (Essential, Pro, Enterprise)
5. **Usage Tracking** - מעקב אחר שימוש ועלויות
6. **Rate Limiting** - מגבלות יומיות וחודשיות

---

## 📋 שלבי התקנה

### 1. Install Dependencies

```bash
npm install
```

זה יתקין את `openai` (שהוספנו ל-`package.json`).

### 2. Add Environment Variable

הוסף ל-`.env`:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

קבל API key מ-[OpenAI Platform](https://platform.openai.com/api-keys)

### 3. Run Prisma Migration

```bash
npx prisma db push
```

זה יוסיף לדאטהבייס:
- עמודות חדשות ל-`User` model (AI settings, billing)
- `AIUsageStats` - סטטיסטיקות שימוש
- `SessionPrep` - Session Prep היסטוריה
- `GlobalAISettings` - הגדרות גלובליות
- 2 Enums חדשים: `AITier`, `SubscriptionStatus`

### 4. Build & Deploy

```bash
npm run build
npm start
```

---

## 🎯 איך להשתמש

### למשתמשים רגילים:

1. **הגדר את ה-AI Assistant**:
   - לך ל: **הגדרות → AI Assistant**
   - בחר את הגישות הטיפוליות שלך (CBT, פסיכודינמית, וכו')
   - התאם את סגנון הניתוח והטון
   - (זמין רק ל-Pro ו-Enterprise users)

2. **קבל Session Prep**:
   - בדשבורד, לחץ על "צור Session Prep" ליד כל פגישה
   - ה-AI ינתח את הפגישות האחרונות ויכין briefing מקצועי

### למנהל מערכת (Admin):

1. **Admin Dashboard**:
   - לך ל: **ניהול מערכת → AI Usage** (רק למנהלים)
   - צפה בסטטיסטיקות: משתמשים, קריאות, עלויות, רווחים

2. **הגדרות גלובליות**:
   - לך ל: **AI Usage → הגדרות גלובליות**
   - הגדר מגבלות יומיות/חודשיות לכל תוכנית
   - הגדר תקציב מקסימלי והתראות
   - שלוט בהתנהגות בחריגה (חסימה/התראה)

---

## 💰 תוכניות מחיר

| תוכנית | מחיר | AI Model | תכונות |
|--------|------|----------|---------|
| 🥉 **Essential** | 100₪ | ❌ No AI | כל התכונות הבסיסיות (ללא AI) |
| 🥈 **Professional** | 120₪ | GPT-4o-mini | Session Prep, ניתוח מתקדם |
| 🥇 **Enterprise** | 150₪ | GPT-4o | הכי חכם, ניתוח עמוק, Deep Analysis |

### עלויות למנהל המערכת:

**GPT-4o-mini** (Pro):
- Input: $0.15 / 1M tokens
- Output: $0.60 / 1M tokens
- **עלות ממוצעת לקריאה:** ~0.002₪

**GPT-4o** (Enterprise):
- Input: $2.50 / 1M tokens
- Output: $10.00 / 1M tokens
- **עלות ממוצעת לקריאה:** ~0.03₪

**דוגמה:**
- משתמש Pro עם 25 פגישות/שבוע = ~100 קריאות/חודש = **~0.2₪** עלות
- רווח: 120₪ - 100₪ - 0.2₪ = **19.8₪ רווח נקי**

---

## 🔒 הגבלות ובקרה

### מגבלות ברירת מחדל:

- **Essential**: 0 קריאות (אין AI)
- **Pro**: 30 קריאות/יום, 600/חודש
- **Enterprise**: 100 קריאות/יום, 2000/חודש

### בקרת תקציב:

- תקציב מקסימלי: 5000₪/חודש
- התראה ב-4000₪ (80%)
- אפשרות לחסום משתמשים בחריגה

### אופטימיזציה:

- ✅ **Cache** - שמירת תוצאות זהות (חיסכון ~30%)
- ✅ **Compression** - דחיסת prompts ארוכים

---

## 📊 API Endpoints חדשים

### User Endpoints:

```
GET  /api/user/ai-settings          # קבל הגדרות AI
POST /api/user/ai-settings          # שמור הגדרות AI
POST /api/ai/session-prep           # צור Session Prep
```

### Admin Endpoints:

```
GET  /api/admin/ai-settings         # קבל הגדרות גלובליות
POST /api/admin/ai-settings         # עדכן הגדרות גלובליות
```

---

## 🧠 גישות טיפוליות נתמכות

- **CBT** - קוגניטיבית התנהגותית
- **Psychodynamic** - פסיכודינמית
- **ACT** - Acceptance & Commitment
- **DBT** - דיאלקטית התנהגותית
- **Solution-Focused** - ממוקדת פתרונות
- **Humanistic** - הומניסטית
- **Systemic** - מערכתית/משפחתית
- **EMDR** - עיבוד טראומות
- **Mindfulness** - מיינדפולנס
- **Gestalt** - גשטלט
- **Existential** - אקזיסטנציאלית
- **Coaching** - קוצ'ינג/NLP
- **Eclectic** - אקלקטית

המשתמש יכול לבחור מספר גישות ול-AI יתאים את הניתוח בהתאם!

---

## 🚀 מה הלאה?

### שלב הבא (אופציונלי):

1. **Stripe Integration** - חיבור למערכת תשלומים
2. **Email Alerts** - התראות למנהל על חריגות
3. **Deep Weekly Analysis** - ניתוח שבועי מעמיק (Enterprise)
4. **Dashboard Charts** - גרפים של שימוש לאורך זמן

---

## ⚠️ שים לב

- **API Key**: חובה להוסיף `OPENAI_API_KEY` ל-environment variables
- **Admin Access**: רק משתמשים עם role="ADMIN" יכולים לגשת ל-Admin Dashboard
- **Patient Limit**: הגבלה של 40 מטופלים פעילים לכל משתמש (ב-User model יש `maxActiveClients`)
- **Archived Patients**: מטופלים בארכיון לא עולים כסף (רק active patients)

---

## 📞 תמיכה

אם יש בעיות או שאלות:
1. בדוק שה-`OPENAI_API_KEY` קיים ב-environment variables
2. בדוק שה-Prisma migration רץ בהצלחה
3. בדוק logs של Render/Server לשגיאות

---

**נבנה על ידי:** Claude Sonnet 4.5 🤖  
**תאריך:** 02/02/2026  
**גרסה:** 1.0.0

🎉 **מזל טוב! המערכת מוכנה!**
