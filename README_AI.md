# 🧠 AI Therapy Assistant - מערכת ניהול פרקטיקה חכמה

## 🎉 מה חדש? AI Therapy Assistant!

המערכת שודרגה עם פיצ'ר AI מתקדם שמספק הכנה חכמה ומקצועית לכל פגישה!

### ✨ תכונות עיקריות:

- 🤖 **AI Session Prep** - ניתוח אוטומטי והכנה לפגישות
- 🧠 **13 גישות טיפוליות** - CBT, פסיכודינמית, ACT, DBT, ועוד
- 🎨 **התאמה אישית** - סגנון ניתוח, טון, והוראות מותאמות
- 📊 **Admin Dashboard** - בקרה מלאה על שימוש ועלויות
- 💰 **3 תוכניות** - Essential, Professional, Enterprise

---

## 🚀 התחלה מהירה

### אפשרות 1: התקנה מהירה (5 דקות)
ראה: **[QUICKSTART.md](./QUICKSTART.md)** 📖

```bash
# 1. התקן dependencies
npm install

# 2. הוסף API key ל-.env
echo "OPENAI_API_KEY=sk-..." >> .env

# 3. עדכן database
npx prisma db push
npx prisma generate

# 4. הרץ migration (למשתמשים קיימים)
npx ts-node scripts/migrate-ai-settings.ts

# 5. Build & Run
npm run build
npm start
```

### אפשרות 2: מדריך מלא
ראה: **[AI_ASSISTANT_README.md](./AI_ASSISTANT_README.md)** 📚

---

## 📖 תיעוד

| קובץ | תיאור |
|------|-------|
| **[QUICKSTART.md](./QUICKSTART.md)** | התקנה מהירה ובדיקות |
| **[AI_ASSISTANT_README.md](./AI_ASSISTANT_README.md)** | מדריך מלא ומקיף |
| **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** | סיכום טכני מפורט |
| **[FILES_CREATED.md](./FILES_CREATED.md)** | רשימת כל הקבצים החדשים |

---

## 💰 תוכניות מחיר

| תוכנית | מחיר | AI Model | תכונות |
|--------|------|----------|---------|
| 🥉 Essential | 100₪ | ❌ No AI | כל התכונות הבסיסיות |
| 🥈 Professional | 120₪ | GPT-4o-mini | Session Prep + ניתוח מתקדם |
| 🥇 Enterprise | 150₪ | GPT-4o | הכי חכם + Deep Analysis |

---

## 🎯 למשתמשים

### 1. הגדר את ה-AI
לך ל: **הגדרות → AI Assistant**
- בחר גישות טיפוליות
- התאם סגנון וטון
- הוסף הוראות מותאמות

### 2. קבל Session Prep
לך ל: **AI Session Prep** (בסיידבר)
- לחץ "צור Session Prep"
- קבל briefing מקצועי תוך שניות!

---

## 👨‍💼 למנהל מערכת

### Admin Dashboard
לך ל: **ניהול מערכת → AI Usage**

תוכל:
- 📊 לצפות בסטטיסטיקות שימוש
- 👥 לנהל משתמשים
- 💰 לעקוב אחר עלויות ורווחים
- ⚙️ להגדיר מגבלות ובקרה

### הגדרות גלובליות
- מגבלות יומיות/חודשיות
- תקציב מקסימלי
- חסימה/התראה בחריגה
- אופטימיזציה (Cache, Compression)

---

## 🔧 דרישות

### Environment Variables
```env
OPENAI_API_KEY=sk-...        # Required for AI
DATABASE_URL=...             # Your PostgreSQL
NEXTAUTH_SECRET=...
# ... (all existing vars)
```

### Dependencies
- Node.js 18+
- PostgreSQL
- OpenAI API account

---

## 🗄️ Database Schema

השדות החדשים ב-`User` model:
```prisma
aiTier                  AITier    @default(ESSENTIAL)
therapeuticApproaches   String[]  @default([])
approachDescription     String?
analysisStyle           String    @default("professional")
aiTone                  String    @default("formal")
customAIInstructions    String?
maxActiveClients        Int       @default(40)
```

טבלאות חדשות:
- `AIUsageStats` - מעקב שימוש
- `SessionPrep` - היסטוריה
- `GlobalAISettings` - הגדרות גלובליות

---

## 🎨 Screenshots

### AI Session Prep
![AI Prep](./docs/screenshots/ai-prep.png) *(להוסיף)*

### Admin Dashboard
![Admin](./docs/screenshots/admin-dashboard.png) *(להוסיף)*

### AI Settings
![Settings](./docs/screenshots/ai-settings.png) *(להוסיף)*

---

## 🐛 בעיות נפוצות

### "OPENAI_API_KEY is not configured"
הוסף את ה-key ל-`.env`:
```bash
OPENAI_API_KEY=sk-proj-...
```

### Prisma Errors
```bash
npx prisma generate
npx prisma db push --accept-data-loss
```

### Component/Table not found
```bash
npm install
```

---

## 📊 עלויות AI

### GPT-4o-mini (Pro):
- ~0.002₪ לקריאה
- משתמש עם 25 פגישות/שבוע = **~0.2₪/חודש**
- רווח: **19.8₪** (120₪ - 100₪ - 0.2₪)

### GPT-4o (Enterprise):
- ~0.03₪ לקריאה
- משתמש עם 25 פגישות/שבוע = **~3₪/חודש**
- רווח: **47₪** (150₪ - 100₪ - 3₪)

---

## 🔜 בקרוב

- [ ] Stripe Integration (billing אוטומטי)
- [ ] Deep Weekly Analysis (Enterprise)
- [ ] Charts & Analytics
- [ ] Email Alerts למנהל
- [ ] Multi-language support

---

## 📞 תמיכה

יש בעיה? בדוק את:
1. **[QUICKSTART.md](./QUICKSTART.md)** - troubleshooting
2. **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - פרטים טכניים
3. **[AI_ASSISTANT_README.md](./AI_ASSISTANT_README.md)** - מדריך מלא

---

## 🤝 תרומה

הפרויקט בבניה פעילה! ברוכים הבאים לתרום.

---

## 📄 רישיון

כל הזכויות שמורות © 2026

---

## ⭐ מיוחד

**נבנה עם:** Claude Sonnet 4.5 🤖  
**תאריך:** פברואר 2026  
**גרסה:** 2.0.0 (AI Update)

---

**🎉 תהנה מהמערכת החדשה!**

*מערכת ניהול פרקטיקה מקצועית עם AI מתקדם לטיפול נפשי בישראל*
