# דוח בדיקת אבטחה מקיפה - 2026-05-25

הבדיקה בוצעה כסקירה סטטית רחבה של מערכת MyTipul, עם דגש על מידע רפואי/טיפולי רגיש: הרשאות, בידוד בין קליניקות, דליפות לדפדפן, הצפנה, קבצים, webhooks/cron ותשתית Render.

## תקציר מנהלים

המערכת כוללת שכבות אבטחה רציניות: `requireAuth`, `src/proxy.ts`, scope מרכזי ב-`src/lib/scope.ts`, הצפנת שדות רגישים ב-`src/lib/encrypted-fields.ts`, cookies קשיחים, CSP, signed URLs להקלטות, audit logs, rate limits, והגנות ל-webhooks/cron.

עם זאת, נמצאו כמה סיכונים שדורשים טיפול:

1. `public/sw.js` שומר תשובות GET של `/api/*` ב-Cache Storage של הדפדפן. זה סיכון גבוה לשמירת PHI על מחשב משותף גם אחרי logout.
2. `src/app/api/email/incoming/route.ts` משייך מייל נכנס למטופל לפי email גלובלי, בלי tenant/therapist scope. זה עלול לשייך תוכן טיפולי למטפל הלא נכון.
3. מסמכים ב-`src/app/api/documents/route.ts`, `src/app/api/documents/[id]/route.ts`, ו-`src/app/api/uploads/[...path]/route.ts` נגישים למזכירה לפי scope ארגוני, למרות שמסמכים יכולים להיות קליניים.
4. מודלי AI/קליניקה חדשים ב-`prisma/schema.prisma` לא מכוסים כולם במפת ההצפנה.
5. דפי error מציגים `error.message` ומדפיסים error גולמי ל-console.
6. הייצוא הישן של תיק מטופל חסר `Cache-Control: no-store`.
7. `render.yaml` ו-`package.json` עדיין מפעילים `prisma db push` ב-production.
8. קיימים גם Render cron jobs וגם scheduler פנימי ב-`src/lib/scheduler.ts`, מה שעלול ליצור כפילויות.
9. rate limiting מבוסס `Map` בזיכרון ולכן לא מתאים ל-scale-out.
10. storage מקומי ב-Render (`UPLOADS_DIR`) אינו פתרון טוב לקבצי PHI לאורך זמן.

## ממצאים לפי חומרה

### גבוה: Service Worker שומר API responses עם PHI

קובץ: `public/sw.js`

הקוד שומר כל תשובת GET/HEAD תקינה של `/api/*`:

```47:64:public/sw.js
  // API: always hit network for mutations; only cache safe GET (never cache POST — same URL can be dry-run vs apply)
  if (event.request.url.includes('/api/')) {
    const method = (event.request.method || 'GET').toUpperCase();
    const isReadOnly = method === 'GET' || method === 'HEAD';
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (isReadOnly && response.ok) {
            const copy = response.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, copy);
          }
```

השפעה: פרטי מטופלים, פגישות, תמלולים, תשלומים ומסמכים יכולים להישאר ב-Cache Storage בדפדפן. במחשב משותף או גנוב זה סיכון משמעותי.

תיקון מומלץ: לא לשמור כלל `/api/*` ב-Service Worker. עבור API יש לבצע network-only, ובכשל להחזיר שגיאה ולא cache. בנוסף להוסיף `Cache-Control: private, no-store` לכל API שמחזיר PHI.

### גבוה: שיוך מייל נכנס לפי email גלובלי

קובץ: `src/app/api/email/incoming/route.ts`

```42:54:src/app/api/email/incoming/route.ts
    // Find the client by email
    const senderEmail = from.toLowerCase().trim();
    const client = await prisma.client.findFirst({
      where: {
        email: {
          equals: senderEmail,
          mode: 'insensitive'
        }
      },
      include: {
        therapist: true,
      }
    });
```

השפעה: אם אותו email קיים אצל שני מטפלים/קליניקות, המייל עלול להישמר בתיק הלא נכון. תוכן מייל יכול לכלול PHI.

תיקון מומלץ: לקבוע את ה-tenant לפי כתובת היעד (`to`) או mailbox ייעודי לכל מטפל/קליניקה, ולחפש `Client` לפי email יחד עם `therapistId`/`organizationId`. אם אין tenant חד-משמעי, לדחות את webhook ל-manual review במקום `findFirst`.

### גבוה: מזכירה יכולה לראות/להוריד מסמכים קליניים

קבצים: `src/app/api/documents/route.ts`, `src/app/api/documents/[id]/route.ts`, `src/app/api/uploads/[...path]/route.ts`, `src/app/api/clients/[id]/route.ts`

ה-scope מאפשר למזכירה לראות מטופלים בארגון, והמסמכים נטענים/מוגשים לפי אותו scope. ב-`src/lib/scope.ts` קיימת חסימה למודלים קליניים, אבל `Document` אינו חסום.

השפעה: מסמכים מסוג intake, אבחון, סריקות, דוחות וטפסים יכולים להיות PHI מלא. אם תפקיד המזכירה אמור להיות אדמיניסטרטיבי בלבד, זה bypass משמעותי.

תיקון מומלץ: להחליט מודל הרשאות למסמכים:

- ברירת מחדל: מזכירה לא רואה `Document` ולא מורידה `/api/uploads/documents/*`.
- אם צריך מסמכים אדמיניסטרטיביים, להוסיף `Document.sensitivity` או `Document.category` ולהתיר רק `ADMINISTRATIVE`.
- להוסיף tests: secretary GET documents/upload path returns 403.

### גבוה: מודלי AI/קליניקה לא מוצפנים במלואם

קבצים: `prisma/schema.prisma`, `src/lib/encrypted-fields.ts`

מפת ההצפנה מכסה שדות מרכזיים כמו `Client.notes`, `SessionNote.content`, `Transcription.content`, `QuestionnaireResponse.answers`, ו-`CommunicationLog.content`. אבל נמצאו שדות קליניים שאינם במפה:

- `SessionAnalysis.content`, `SessionAnalysis.insights`
- `QuestionnaireAnalysis.content`, `QuestionnaireAnalysis.insights`, `QuestionnaireAnalysis.recommendations`
- `SessionPrep.content`, `SessionPrep.insights`, `SessionPrep.recommendations`
- `AIInsight.content`, `AIInsight.metadata`
- `EmotionLog.context`, `EmotionLog.triggers`
- `ConsentForm.content`, `ConsentForm.signatureData`
- `InsurerReport.reportData`, `InsurerReport.errorMessage`

השפעה: dump של DB יחשוף חלק מהנתונים הקליניים החדשים גם אם שדות ותיקים מוצפנים.

תיקון מומלץ: להוסיף את השדות ל-`ENCRYPTED_FIELDS`/`ENCRYPTED_JSON_FIELDS`, ואז לבצע backfill הצפנה לרשומות קיימות בזהירות.

### בינוני-גבוה: דפי error חושפים הודעות שגיאה גולמיות

קבצים: `src/app/error.tsx`, `src/app/(dashboard)/dashboard/clients/error.tsx`

```26:31:src/app/error.tsx
        <div className="bg-muted p-4 rounded-lg text-sm text-right" dir="ltr">
          <p className="font-mono break-all">{error.message}</p>
          {error.digest && (
            <p className="text-xs text-muted-foreground mt-2">
              Error ID: {error.digest}
```

השפעה: שגיאות Prisma, IDs, נתיבי מערכת או פרטים רגישים יכולים להופיע למשתמש/בצילום מסך/DevTools.

תיקון מומלץ: להציג הודעה עברית כללית בלבד, להשאיר רק `digest`, ולהסיר `console.error(error)` בצד לקוח או להחליף בלוגר מצומצם ללא PHI.

### בינוני-גבוה: over-fetching של PHI לדפדפן

קבצים: `src/app/(dashboard)/dashboard/clients/[id]/page.tsx`, `src/app/(dashboard)/dashboard/clients/[id]/edit/page.tsx`, `src/app/(dashboard)/dashboard/intake/[clientId]/page.tsx`, `src/app/api/clients/[id]/route.ts`

דוגמאות:

- דף עריכת מטופל קורא `/api/clients/[id]` שמחזיר גם sessions, payments, recordings, documents לפי role, למרות שהטופס צריך שדות עריכה בסיסיים.
- דף intake קורא `/api/clients/[id]` כדי לקבל `name` ו-`intakeNotes`, אבל מקבל payload רחב יותר.
- דף פרופיל מטופל מעביר סיכומי פגישות ל-`SummariesTab` כבר בטעינת הדף.

השפעה: מידע קליני מיותר מגיע ל-RSC/hydration/network state, חשוף יותר ל-DevTools, extensions ו-cache.

תיקון מומלץ: ליצור endpoints צרים:

- `/api/clients/[id]/edit-data`
- `/api/clients/[id]/intake-data`
- lazy load לסיכומים/שאלונים/מסמכים רק כשה-tab נפתח.

### בינוני: PII ב-query string בעת שדרוג פונה למטופל

קבצים: `src/components/calendar/session-detail-dialog.tsx`, `src/components/clients/consultation-clients-section.tsx`, `src/app/(dashboard)/dashboard/clients/new/page.tsx`

השפעה: שם, טלפון ומייל נשמרים ב-browser history, logs, screenshots ו-Referer.

תיקון מומלץ: להעביר רק `fromQuick=<id>` ולשלוף את הפרטים מהשרת לפי scope, או להשתמש ב-state מקומי שאינו URL.

### בינוני: export ZIP ישן חסר no-store

קבצים: `src/app/api/clients/[id]/export/route.ts`, `src/app/api/clients/export-all/route.ts`

ב-DSAR החדש כבר קיים:

```127:134:src/app/api/clients/[id]/export-personal-data/route.ts
    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${asciiSafe}"; filename*=UTF-8''${utf8Encoded}`,
        // M16.5 (סבב 16b): אסור cache של PHI exports — חובה no-store.
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
```

אבל בייצוא הישן חסרים headers כאלה.

תיקון מומלץ: להוסיף `Cache-Control: no-store, no-cache, must-revalidate, private` ו-`Pragma: no-cache` לכל response של ZIP/PDF שמכיל PHI.

### בינוני: `requireAdmin`/`requirePermission` לא בודקים stale session

קובץ: `src/lib/api-auth.ts`

`requireAuth` בודק `passwordStale`, `sessionStale`, `sessionExpired`, אבל helpers של admin בודקים רק session/2FA/role. כרגע `src/proxy.ts` מפצה על `/api/admin/*`, אבל זה defense by route placement.

תיקון מומלץ: להוציא helper פנימי משותף שמבצע את בדיקות session freshness לכל helpers.

### בינוני: `prisma db push` ב-production

קבצים: `render.yaml`, `package.json`

```12:12:render.yaml
    startCommand: npx prisma db push && (npx prisma db execute --file=prisma/sql/session-time-constraint.sql --schema=prisma/schema.prisma || true) && npm start
```

השפעה: שינוי schema עתידי עלול לגרום drift/איבוד מידע או הבדל בין migrations ל-DB בפועל.

תיקון מומלץ: לבצע baseline מסודר, backup מלא, ואז לעבור ל-`prisma migrate deploy`.

### בינוני: scheduler פנימי כפול לצד Render cron

קבצים: `src/instrumentation.ts`, `src/lib/scheduler.ts`, `render.yaml`

```1:5:src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
```

השפעה: תזכורות, חובות, alert generation ו-fix jobs עלולים לרוץ פעמיים. גם אם יש duplicate prevention בחלק מהמקומות, לא נכון להסתמך על זה לכל job.

תיקון מומלץ: לבחור source of truth אחד. ב-Render מומלץ לכבות scheduler פנימי ב-production או להפעיל אותו רק מאחורי env כמו `ENABLE_IN_APP_SCHEDULER=true`.

### בינוני: rate limiting בזיכרון

קובץ: `src/lib/rate-limit.ts`

הקוד עצמו מתעד שהמימוש מתאים לשרת יחיד בלבד.

השפעה: ב-scale-out או serverless, brute force/exfiltration limits מוכפלים או מתאפסים.

תיקון מומלץ: לעבור ל-Redis/Upstash לפני מעבר ליותר מ-instance אחד.

### בינוני: storage מקומי ב-Render

קבצים: `render.yaml`, `src/lib/storage.ts`

השפעה: קבצי uploads/recordings/receipts על דיסק מקומי אינם מתאימים ל-PHI ארוך טווח: סיכון אובדן בריסטארט/scale, גיבוי לא ברור, והצפנה-at-rest לא בשליטת האפליקציה.

תיקון מומלץ: להעביר ל-S3/GCS/R2 עם encryption-at-rest, signed URLs, lifecycle policies, audit logging ו-backup strategy.

### בינוני-נמוך: public token endpoints

קבצים: `src/app/api/receipts/[id]/public/route.ts`, `src/app/api/p/departure-choice/[token]/route.ts`, `src/app/api/booking/[slug]/route.ts`

יש הגנות טובות: tokens חזקים, rate limits, response מינימלי בחלק מהמקומות. עדיין:

- `departure-choice` משתמש ב-leftmost `X-Forwarded-For`; עדיף `getClientIp`.
- `booking` משתמש בכמה `Map` מקומיים נפרדים בנוסף ל-rate limiter המרכזי.
- public receipt חושף שם לקוח ותאריך פגישה כאשר token דולף.

תיקון מומלץ: לאחד IP parsing, לאחד rate limits, ולוודא שכל public token response מינימלי.

### נמוך: logging ו-console בצד לקוח

קבצים: `src/hooks/use-pwa.ts`, `src/lib/scheduler.ts`, דפי dashboard/admin שונים

השפעה: לא תמיד דליפה ישירה, אבל במערכת PHI עדיף לא להדפיס error objects גולמיים בצד לקוח ולא להשתמש ב-`console.log` ב-production scheduler.

תיקון מומלץ: להסיר client `console.error` לא הכרחי; ב-server להשתמש רק ב-`logger`.

## נקודות חיוביות שנמצאו

- `src/proxy.ts` מכיל gate ל-2FA, session freshness, blocked users, admin/manager role ו-CSP nonce.
- `src/lib/scope.ts` הוא מקור מרכזי טוב להרשאות לפי קליניקה ותפקיד.
- `src/lib/prisma.ts` מפעיל הצפנה אוטומטית על create/update/find למודלים שמופיעים במפה.
- `src/app/api/recordings/[id]/audio/route.ts` בודק signed URL, cookie binding, scope מחדש ו-audit.
- `src/app/api/clients/[id]/export-personal-data/route.ts` מוגן היטב יחסית: POST, auth, scope, secretary block, rate limit, audit ו-no-store.
- `src/lib/logger.ts` משמש ברוב ה-server code ומחליף console גולמי.
- webhooks/cron כוללים סודות, rate limit, idempotency/replay protections בחלק גדול מהמקומות.
- `force-dynamic` מופיע ברוב רחב של API routes שנבדקו.

## תוכנית תיקון מומלצת

### סבב 1 - דליפות PHI מיידיות

1. לשנות `public/sw.js` כך ש-`/api/*` לא נשמר כלל ב-cache.
2. להוסיף no-store headers ל-API/exports שמחזירים PHI.
3. להסתיר `error.message` מדפי error.
4. לחסום מזכירה ממסמכים קליניים או להוסיף סיווג מסמך.
5. לתקן incoming email tenant routing.

### סבב 2 - הצפנה וצמצום payloads

1. להוסיף מודלי AI/קליניקה למפת ההצפנה.
2. לבנות backfill הצפנה לרשומות קיימות.
3. להחליף `/api/clients/[id]` הרחב ב-endpoints צרים למסכי edit/intake/email.
4. לעשות lazy loading לטאבים עם סיכומים, שאלונים ומסמכים.
5. להסיר PII מ-query strings.

### סבב 3 - תשתית ותפעול

1. מעבר מ-`prisma db push` ל-`prisma migrate deploy`.
2. לכבות scheduler פנימי ב-production או להעביר לשליטה ב-env.
3. מעבר מ-in-memory rate limit ל-Redis/Upstash.
4. מעבר storage לקבצי PHI לענן עם encryption-at-rest.
5. להפריד secrets ללא fallback ל-`NEXTAUTH_SECRET`/`ENCRYPTION_KEY` לאחר migration.

### סבב 4 - בדיקות אבטחה

1. test: מזכירה לא יכולה לקרוא/להוריד מסמכים קליניים.
2. test: שני מטופלים באותו email בקליניקות שונות לא גורמים לשיוך מייל לא נכון.
3. test: `/api/clients/[id]`, sessions, recordings, documents, payments חסומים בין מטפלים/קליניקות.
4. test: SW לא שומר `/api/*` ב-Cache Storage.
5. test: exports מחזירים no-store.
6. test: signed recording URL פג תוקף וחסום למשתמש אחר.
7. static CI: כל API route כולל `force-dynamic`.
8. static CI: מודלים עם `@db.Text`/`Json` קליניים מופיעים במפת הצפנה או ברשימת החרגות מודעת.

## מגבלות הבדיקה

הבדיקה הייתה סטטית מתוך הקוד. לא בוצעה בדיקה דינמית מול שרת חי, לא נבדקו סודות אמיתיים ב-Render dashboard, ולא הורץ `npm audit` מול registry. לכן יש להשלים QA/DAST בסביבת staging לפני מסקנה סופית על exploitability.
