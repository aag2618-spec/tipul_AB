# תיקון ניווט התראות פעמון + תזכורות מהבהבות בתיבת מטלות

## הבעיה
1. לחיצה על התראת ערב/משימות בפעמון לא גוללת לתיבת מטלות בדשבורד
2. תזכורות בוקר/ערב לא מהבהבות כמו מטלות
3. לחיצה על תזכורת בתיבה לא פותחת דיאלוג עם הפרטים
4. תזכורות לא נעלמות אוטומטית

## שינויים

### 1. גלילה מהפעמון לתיבת מטלות
**קובץ**: `src/components/dashboard-header.tsx` (שורה 193-194)
- אם כבר בדשבורד → `document.getElementById('personal-tasks').scrollIntoView()`
- אם בדף אחר → `router.push('/dashboard#personal-tasks')` + גלילה אחרי טעינה

### 2. תזכורות מהבהבות + דיאלוג בלחיצה
**קובץ**: `src/components/tasks/personal-tasks-widget.tsx`
- הוספת `animate-pulse` על תזכורות (כמו מטלות עם תזכורת פעילה)
- לחיצה על תזכורת → פותח דיאלוג עם כותרת + תוכן מלא + כפתור "סמן כנקרא"
- תזכורות נעלמות אוטומטית אחרי 6 שעות (בדיקה client-side לפי createdAt)
- תזכורות לא עוברות להיסטוריה

### 3. גלילה אוטומטית בדשבורד כשמגיעים עם hash
**קובץ**: `src/app/(dashboard)/dashboard/page.tsx`
- useEffect שבודק `#personal-tasks` ב-URL וגולל אליו

## קבצים לשינוי
1. `src/components/dashboard-header.tsx`
2. `src/components/tasks/personal-tasks-widget.tsx`
3. `src/app/(dashboard)/dashboard/page.tsx`

## בדיקות
- tsc + vitest עוברים
- 3 סוכני ביקורת במקביל אחרי הבנייה
