# Tipul AB - תוכנית שיפורים

## הקשר
Tipul AB היא מערכת ניהול קליניקה לטיפול רגשי, בנויה על Next.js 16 עם 152+ נתיבי API, 85+ קומפוננטות, ואינטגרציות חיוב מורכבות. סקירה מעמיקה חשפה פרצות אבטחה, היעדר טסטים, בעיות איכות קוד, ואתגרי תחזוקה.

---

## עדיפות קריטית (לבצע מיד)

### 1. הסרת `ignoreBuildErrors: true`
**קובץ:** `next.config.ts` (שורה ~28)
- להסיר `typescript: { ignoreBuildErrors: true }`
- להריץ `npx tsc --noEmit` כדי לחשוף את כל שגיאות ה-TS
- לתקן שגיאות החל מ-`src/lib/payment-service.ts` ו-`src/app/api/payments/`
- **למה:** מסתיר שגיאות טיפוסים באפליקציה שמעבדת תשלומים

### 2. תיקון באג הרשאות קבצים (`contains` -> `endsWith`)
**קובץ:** `src/app/api/uploads/[...path]/route.ts` (שורות ~32, 46, 74)
- לשנות `fileUrl: { contains: fileName }` ל-`fileUrl: { endsWith: '/' + fileName }`
- אותו תיקון ל-`audioUrl: { contains: fileName }`
- **למה:** `contains` יכול להתאים לקבצים של משתמשים אחרים אם שמות הקבצים חופפים

### 3. הוספת הגבלת קצב (rate limiting) לנתיבי אימות
**קבצים:**
- `src/app/api/admin/reset-password/route.ts` - להוסיף `AUTH_RATE_LIMIT`
- `src/app/api/auth/reset-password/route.ts` - להוסיף `AUTH_RATE_LIMIT`
- `src/lib/auth.ts` (callback של authorize) - הגבלת קצב להתחברות
- **למה:** `rate-limit.ts` קיים עם presets אבל מופעל רק בנתיב אחד. reset-password של אדמין חשוף ל-brute force
- **לשימוש חוזר:** `checkRateLimit` ו-`AUTH_RATE_LIMIT` מ-`src/lib/rate-limit.ts`

### 4. הסרת מפתח הצפנה קבוע בקוד
**קובץ:** `src/lib/encryption.ts` (שורה ~8)
- להחליף `"default-key-for-development-only-32chars!!"` ביצירת מפתח אקראי לכל הרצה בפיתוח
- להשאיר את ה-throw בפרודקשן
- **למה:** המפתח ב-repo, כל מי שיש לו גישה יכול לפענח נתוני פיתוח

---

## עדיפות גבוהה (ספרינט הבא)

### 5. הוספת framework לטסטים + טסטים ראשוניים
- להתקין `vitest` כ-devDependency, ליצור `vitest.config.ts`
- להוסיף `"test": "vitest run"` ל-`package.json`
- לכתוב טסטים ראשונים עבור:
  - `src/lib/encryption.ts` - encrypt/decrypt הלוך-חזור, פורמט ישן
  - `src/lib/rate-limit.ts` - אכיפת מגבלות, תפוגת חלון
  - `src/lib/payment-utils.ts` - חישוב חובות
- **למה:** אפס טסטים באפליקציה שמטפלת בתשלומים

### 6. חילוץ helper משותף לאימות
**קובץ חדש:** `src/lib/api-auth.ts`
- ליצור `requireAuth()` שמחזיר `{ userId, session }` או תשובת 401
- ליצור `requireAdmin()` לנתיבי אדמין
- להעביר נתיבים בהדרגה, החל מ-`src/app/api/payments/route.ts`
- **למה:** אותה בדיקת אימות של 4 שורות משוכפלת ב-150+ נתיבים

### 7. הוספת ולידציית Zod לנתיבי API
**תיקייה חדשה:** `src/lib/validations/`
- ליצור סכמות: `payment.ts`, `client.ts`, `session.ts`, `auth.ts`
- ליצור helper `parseBody(request, schema)`
- להחיל קודם על נתיבי תשלומים ואימות
- **למה:** Zod מותקן אבל לא בשימוש. הנתיבים עושים ולידציה לא עקבית
- **לשימוש חוזר:** `zod` כבר ב-`package.json`

---

## עדיפות בינונית

### 8. פיצול קבצים גדולים
| קובץ | שורות | פעולה |
|------|-------|--------|
| `src/lib/payment-service.ts` | 1,282 | לפצל ל-`src/lib/payments/` (receipt-service, payment-creator, bulk-payment, types) |
| `src/components/sessions/sessions-view.tsx` | 1,255 | לחלץ רשימה, פילטרים, פאנל פרטים |
| `src/components/dashboard/today-session-card.tsx` | 1,017 | לחלץ פריט כרטיס, סטטוס, פעולות |
| `src/app/api/questionnaires/seed/route.ts` | 1,471 | להעביר נתוני seed ל-`src/data/questionnaire-seeds.ts` |

### 9. לוגים מובנים
**קובץ חדש:** `src/lib/logger.ts`
- לוגר JSON קליל (בלי תלויות כבדות) עם רמות, request ID, הקשר משתמש
- להחליף `console.error` בנתיבי תשלומים ו-webhooks קודם
- **למה:** לוגים לא מובנים הופכים דיבוג בפרודקשן לבלתי אפשרי

### 10. הסרת תלות `openai` שלא בשימוש
- לוודא שאף נתיב לא קורא ל-`src/lib/openai.ts`
- אם לא בשימוש, למחוק קובץ + להסיר `openai` מ-`package.json`

### 11. הוספת React error boundaries
- ליצור `src/components/error-boundary.tsx`
- להוסיף `error.tsx` בקטעי נתיב מרכזיים: `dashboard/payments/`, `dashboard/sessions/`, `dashboard/clients/`

---

## עדיפות נמוכה

### 12. מיגרציה של פורמט הצפנה ישן
- סקריפט ב-`scripts/migrate-encryption.ts` להצפנה מחדש מפורמט 3-חלקים ל-4-חלקים
- אחרי מיגרציה, להסיר את הענף הישן מ-`decrypt()`

### 13. הפשטת אחסון קבצים מאחורי interface
- ליצור `StorageProvider` interface ב-`src/lib/storage.ts`
- לממש `LocalStorageProvider` (ההתנהגות הנוכחית)
- הכנה למיגרציה ל-S3 לפריסה מורחבת

### 14. סטנדרטיזציה של אימות webhooks
- ליצור `src/lib/webhook-auth.ts` עם wrapper גנרי `withWebhookAuth`
- לאחד תגובות שגיאה בין Sumit, Render, Meshulam

---

## סדר ביצוע מומלץ
1. פריטים 1-4 (תיקוני אבטחה/טיפוסים קריטיים) - מיידי
2. פריטים 5-7 (טסטים, helper אימות, ולידציה) - ספרינט הבא
3. פריטים 8-11 (ריפקטור, לוגים, ניקוי) - הספרינט שאחרי
4. פריטים 12-14 (חוב טכני) - לתזמן לפי יכולת

## אימות
- אחרי פריט 1: `npx tsc --noEmit` עובר בלי שגיאות
- אחרי פריט 2: בדיקה ידנית של העלאת קבצים עם שמות דומים בין משתמשים
- אחרי פריט 3: בדיקת rate limiting עם בקשות מהירות לנתיבי אימות
- אחרי פריט 5: `npm test` עובר, דוח כיסוי נוצר
- אחרי פריט 6: grep מאשר שאין יותר `getServerSession` ישיר בנתיבים שהועברו
- אחרי פריט 8: אף קובץ לא עובר 500 שורות באזורים שהשתנו
