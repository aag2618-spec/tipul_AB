# HANDOFF — חיזוק CSRF (defense-in-depth) — נקודה 2 מצ'ק-ליסט האבטחה

תאריך: 2026-06-18
ענף: main (עבודה ישירה, commits קטנים)

## הבעיה (לא חור פעיל — שכבת הגנה חסרה)
המערכת מסתמכת כיום על `SameSite=Lax` בעוגיית הסשן ([src/lib/auth.ts:257](src/lib/auth.ts)) +
טוקן CSRF מובנה של NextAuth (רק לנתיבי `/api/auth/*`). זה מגן טוב על POST/PUT/DELETE.
**מה שחסר:** אין בדיקת `Origin`/`Sec-Fetch-Site` מרכזית — ההמלצה של OWASP כשכבת הגנה
נוספת מעבר ל-SameSite (מכסה באגי דפדפן, תת-דומיינים, ובקשות state-changing שגגתיות).

## המיפוי
- Middleware מרכזי: [src/proxy.ts](src/proxy.ts) — רץ על `/dashboard`, `/admin`, `/clinic-admin`,
  ו-`/api/*` **למעט** `/api/auth/`, `/api/health`, `/api/webhooks/`, `/api/cron/` (ראה `pathShouldRunProxy`).
- כל בקשות הקריאה/כתיבה מה-frontend הן same-origin (`fetch` רגיל).
- נקודות קצה שמקבלות POST חוצה-מקור לגיטימי (Cardcom/cron) יושבות תחת `/api/webhooks/*`
  ו-`/api/cron/*` — **מוחרגות כבר** מה-proxy, ולכן לא יושפעו.

## הפתרון
helper חדש `isCrossOriginRequest()` ב-[src/lib/csrf.ts](src/lib/csrf.ts), שנקרא ב-proxy.ts על
בקשות מוטציה (POST/PUT/PATCH/DELETE) לנתיבי `/api/*`:
1. `Sec-Fetch-Site` (כל דפדפן מודרני): חוסם `cross-site`; מתיר `same-origin`/`same-site`/`none`.
2. נפילה: השוואת host של `Origin` מול `Host` של הבקשה. mismatch → חסום.
3. אין Origin ואין Sec-Fetch-Site → מתירים (לקוח לא-דפדפן / דפדפן ישן; SameSite הוא הרשת התחתונה,
   ובקשת CSRF תמיד מגיעה מדפדפן ששולח את הכותרות).
חסימה → `403` JSON בעברית.

## סדר ה-gate ב-proxy
לפני בדיקות ה-2FA/הרשאות אבל אחרי חישוב ה-nonce — חסימת CSRF צריכה לקרות מוקדם.

## TODO
- [x] helper + טסטים (TDD) — 18 טסטים עוברים
- [x] שילוב ב-proxy.ts + לוג קליל (ללא PHI) על חסימה
- [x] build (exit 0) + כל 955 הטסטים עוברים + typecheck + lint נקי
- [x] לולאת סוכנים: סייבר + תקינות. ממצא "קריטי" של הסייבר (זימון נחסם)
      נבדק מול הקוד והופרך — POST הזימון הוא same-origin fetch מהדף שלנו
      (booking/t/[token]/page.tsx), לא POST ממייל. אין שבירת זרימה.
- [ ] commit + push (קבצים ספציפיים בלבד — לא `git add .`)

## מסקנה
SameSite=Lax נשאר ההגנה העיקרית; הבדיקה החדשה היא שכבה שנייה (OWASP). מודרני →
Sec-Fetch-Site; ישן → Origin↔Host; ללא כותרות → SameSite. וובהוקים/cron/auth מוחרגים.

## קבצים שנגעתי
- src/lib/csrf.ts (חדש)
- src/lib/__tests__/csrf.test.ts (חדש)
- src/proxy.ts
