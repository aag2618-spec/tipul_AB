# טיפול - מערכת ניהול לפרקטיקה טיפולית

מערכת web מודרנית ומאובטחת לניהול פרקטיקה של מטפלים רגשיים.

## תכונות עיקריות

- **ניהול מטופלים** - הוספה, עריכה, חיפוש וארכיון של מטופלים
- **יומן פגישות** - ניהול פגישות עם לוח שנה אינטראקטיבי
- **סיכומי טיפול** - עורך טקסט עשיר לכתיבת סיכומים מקצועיים
- **הקלטה ותמלול** - הקלטת שיחות עם תמלול אוטומטי (Google AI Studio)
- **ניתוח AI** - ניתוח טיפולי חכם של שיחות (Claude API)
- **תשלומים** - מעקב תשלומים וחובות
- **מסמכים** - העלאה וניהול מסמכים וטפסים
- **דוחות** - סטטיסטיקות והכנסות
- **התראות** - תזכורות יומיות ומשימות ממתינות

## טכנולוגיות

| רכיב | טכנולוגיה |
|------|-----------|
| Frontend | Next.js 16 (App Router) |
| Styling | Tailwind CSS + shadcn/ui |
| Database | PostgreSQL |
| ORM | Prisma 7 |
| Auth | NextAuth.js |
| Calendar | FullCalendar |
| Rich Text | TipTap Editor |
| Charts | Recharts |
| AI Transcription | Google AI Studio |
| AI Analysis | Anthropic Claude |

## התקנה

### דרישות מקדימות

- Node.js 18+
- PostgreSQL 14+

### שלבים

1. **התקנת תלויות:**

```bash
npm install
```

2. **הגדרת משתני סביבה:**

צור קובץ `.env.local` בתיקיית השורש עם:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/tipul?schema=public"

# Authentication
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"

# Google AI Studio - לתמלול
GOOGLE_AI_API_KEY="your-google-ai-api-key"

# Anthropic (Claude) - לניתוח
ANTHROPIC_API_KEY="your-anthropic-api-key"

# Email (אופציונלי)
RESEND_API_KEY="your-resend-api-key"
```

3. **יצירת בסיס הנתונים:**

```bash
npx prisma db push
```

4. **הרצה בסביבת פיתוח:**

```bash
npm run dev
```

פתח [http://localhost:3000](http://localhost:3000) בדפדפן.

## מבנה הפרויקט

```
tipul/
├── prisma/
│   └── schema.prisma          # מודלים של בסיס הנתונים
├── src/
│   ├── app/
│   │   ├── (auth)/            # דפי התחברות והרשמה
│   │   ├── (dashboard)/       # דפי הניהול
│   │   │   ├── clients/       # ניהול מטופלים
│   │   │   ├── calendar/      # יומן ופגישות
│   │   │   ├── sessions/      # סיכומי טיפול
│   │   │   ├── recordings/    # הקלטות ותמלולים
│   │   │   ├── payments/      # חיובים וקבלות
│   │   │   ├── documents/     # מסמכים
│   │   │   ├── reports/       # דוחות
│   │   │   ├── tasks/         # משימות
│   │   │   └── settings/      # הגדרות
│   │   └── api/               # API routes
│   ├── components/            # קומפוננטות
│   ├── lib/                   # פונקציות עזר
│   │   ├── auth.ts            # NextAuth config
│   │   ├── prisma.ts          # Prisma client
│   │   ├── google-ai.ts       # Google AI Studio
│   │   └── claude.ts          # Claude API
│   └── types/                 # TypeScript types
└── uploads/                   # קבצי הקלטות (לא ב-Git)
```

## אבטחה ופרטיות

- כל הנתונים מוצפנים
- מפתחות API נשמרים רק ב-environment variables
- הקלטות ותמלולים נשמרים באופן מקומי
- קריאות ל-AI APIs לא שומרות נתונים

## רישיון

פרויקט פרטי - כל הזכויות שמורות.
