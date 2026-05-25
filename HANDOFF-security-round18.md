# HANDOFF — Security Round 18 (2026-05-25)

## מקור: דוח ביקורת אבטחה GPT + אימות 3 סוכני חקירה

| # | ממצא | חומרה | סטטוס | Commit |
|---|------|-------|--------|--------|
| 18a | SW שומר API responses עם PHI ב-cache | קריטי | done | — |
| 18b | דפי שגיאה חושפים error.message (Prisma, SQL) | קריטי | done | — |
| 18c | export routes חסרי Cache-Control headers | קריטי | done | — |
| 18d | email webhook — findFirst בלי tenant scope | קריטי | done | — |
| 18e | מזכירה יכולה להוריד מסמכים קליניים | קריטי | done | — |
| 18f | מודלי AI/קליני לא מוצפנים (7 models) | בינוני | done | — |
| 18g | PII ב-query strings (שם, טלפון, email) | בינוני | done | — |
| 18h | requireAdmin/Permission חסרי session freshness | בינוני | done | — |
| 18i | scheduler כפול (in-process + Render cron) | בינוני | done | — |
| 18j | receipt ציבורי בלי rate limit | בינוני | done | — |

## תיקונים נוספים שנמצאו בביקורת הסוכנים

| # | ממצא | מקור | סטטוס |
|---|------|------|--------|
| 18f+ | `aiInsight` alias ב-encrypted-fields (decryptDeep recursion) | סוכן 3 | done |
| 18f+ | `pluralToSingular` תיקון `-yses`→`-ysis` | סוכן 3 | done |
| 18b+ | `console.error(error)` ב-payments/sessions error pages | סוכן 1 | done |
| 18c+ | payments/export חסר Cache-Control | סוכן 2 | done |

## נדחה לסבב הבא

| # | ממצא | סיבת דחייה |
|---|------|------------|
| 18k | `prisma db push` → `migrate deploy` | דורש baseline migration — סיכון deploy |
| 18l | rate limit → Upstash Redis | רלוונטי רק ב-scale, instance יחיד כרגע |
| 18m | storage מקומי → S3/R2 + encryption | שינוי תשתיתי גדול |
| 18n | over-fetching של PHI בדף לקוח | שיפור ביצועים + אבטחה נמוכה, דורש פיצול endpoints |
