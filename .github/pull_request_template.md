<!--
תבנית PR — מלא/י את הסקציות הרלוונטיות. אל תמחק/י סעיפי בטיחות
(API contract, perf, security) כדי שה-reviewer יוכל לסמן אותם במהירות.
-->

## תיאור

<!-- מה השינוי? למה? -->

## סוג השינוי

- [ ] feat — תכונה חדשה
- [ ] fix — תיקון באג
- [ ] perf — אופטימיזציה
- [ ] refactor — שינוי פנימי בלי שינוי התנהגות
- [ ] docs / chore / test

## בדיקות

- [ ] `npm run typecheck` עובר
- [ ] `npm run build` עובר (אם נגעתי ב-API/types)
- [ ] בדיקה ידנית של ה-flow הראשי שהושפע

## ⚠️ בקרת חוזה API (חובה לכל perf / refactor של API ו-Prisma)

> רגע ההיסטוריה: commit `a46a514b` ("perf(calendar): שאילתה רזה")
> צמצם את ה-`select` של `/api/sessions/calendar` בלי לעדכן את הצרכן
> (`SessionDetailDialog`). התוצאה: כל פגישה ששולמה הציגה "פטור מתשלום"
> במשך כמה שעות, עד ל-fix `9efe4996`. הסעיפים הבאים מונעים את החזרה
> של אותו דפוס.

- [ ] **לא צמצמתי `select` / `include` בלי לבדוק consumers** — אם כן,
      פירטתי כאן **כל** קומפוננטה שצורכת את התגובה ויידוא שהיא לא
      ניגשת לשדה שהוסר:
      ```
      <אם רלוונטי — רשימה של file:line שבדקתי>
      ```
- [ ] **lazy-load שהובטח ב-commit message — מומש** או הוסר מ-message
      ושיניתי גישה.
- [ ] **TypeScript תפס regressions באמת** — בדקתי שאין שדות אופציונליים
      (`payment?`) שכך השדות שהוסרו מה-API "מסתכלים" שקטים בקונסיומר.
      אם כן, השתמשתי ב-shared Prisma payload type
      (`Prisma.XGetPayload<{ include: typeof Y }>`) במקום שדות
      אופציונליים.
- [ ] **ה-UI לא נופל ל-fallback שקט** — אם ה-API לא מחזיר את הנתונים
      הצפויים, ה-UI מציג שגיאה ברורה (`⚠️ לא הצלחנו לטעון`), לא ערך
      ברירת מחדל סמוי כמו "פטור מתשלום" או "0₪".

## אבטחה

- [ ] לא הוספתי secrets/API keys בקוד או ב-env בקומיט
- [ ] לכל endpoint ציבורי חדש: rate-limit ו-auth/CSRF מתאימים
- [ ] לכל route חדש: `export const dynamic = "force-dynamic"`
- [ ] שאילתות Prisma חדשות עוברות דרך `buildSessionWhere` /
      `buildClientWhere` / `buildPaymentWhere` (scope.ts) — לא ישירות
      `where: { therapistId }`.

## פרטיות / חוק זכויות החולה

- [ ] תוכן קליני (sessionNote, sessionAnalysis, transcription,
      recordings, answers של שאלון) לא חשוף למזכירה — בדקתי בנתיב
      `isSecretary(scopeUser)` של ה-API.
- [ ] PII בלוגים: עברתי על `console.log/logger.info/warn/error` —
      אין email/phone/full-name unredacted.

## תשלומים / קבלות (אם רלוונטי)

- [ ] השתמשתי ב-`calculatePaidAmount()` ולא ב-`payment.amount` ישירות.
- [ ] לכל route שמחזיר `payment` ל-UI: יש `paidAmount` enrichment.
- [ ] `Decimal` עובר דרך `serializePrisma()` או `Number(value) || 0`.

## RTL / נגישות

- [ ] טקסט חדש בעברית
- [ ] `aria-label`/`aria-live` לאזורים דינמיים (טוסטים, סטטוסים)
- [ ] בדקתי במובייל (ויסגור-ויסטה)
