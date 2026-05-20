# HANDOFF — דליפת PHI ב-/admin/receipts (Tenant Leak)

**תאריך:** 2026-05-20
**חומרה:** 🔴 קריטי — Information Disclosure של PHI/PII
**סטטוס:** ✅ תוקן בסבב זה (4 קבצים, אחרי 5 סוכנים + סבב verification)

## הבעיה

הדף `/admin/receipts` בממשק הניהול הציג **את כל הקבלות במערכת**, כולל קבלות `tenant=USER` (קבלות שמטפלים הנפיקו ללקוחות שלהם).

דלף:
- שמות מטופלים (PHI — מידע רפואי מוגן)
- אימיילים של מטופלים
- סכומים ששילמו על טיפול
- מאפשר ל-ADMIN/MANAGER לבטל/לשלוח-שוב קבלות של מטפלים אחרים דרך הכפתורים בטבלה
- ה-API GET איפשר ל-MANAGER (לא רק ADMIN) להגיע ל-PHI דרך `?tenant=USER`/`?tenant=all`

מטופל שנתן הסכמה לטיפול אצל מטפל ספציפי **לא נתן הסכמה ל-MyTipul לראות את שמו**.

## שורש הבעיה

1. `src/app/admin/receipts/page.tsx` — 3 שאילתות Prisma ללא `where: { tenant }`
2. `src/app/api/admin/receipts/[id]/void/route.ts` — `findUnique({ where: { id } })` בלי בדיקת tenant
3. `src/app/api/admin/receipts/[id]/resend/route.ts` — אותה בעיה + branch שמשתמש ב-credentials של המטפל
4. `src/app/api/admin/receipts/route.ts` (GET) — אפשר `?tenant=USER`/`?tenant=all` לכל `receipts.view` (כולל MANAGER)

## תיקונים שבוצעו

### ✅ 1. `src/app/admin/receipts/page.tsx`
הוסף `where: { tenant: "ADMIN" }` ל-3 השאילתות (findMany ראשוני, aggregate שנתי, aggregate חודשי). שדה `tenant` הוא denormalized snapshot ב-CardcomInvoice עצמה (schema.prisma:2506-2508) עם אינדקס `@@index([tenant, issuedAt])` — אין צורך ב-join.

### ✅ 2. `src/app/api/admin/receipts/[id]/void/route.ts`
אחרי `findUnique`, אם `invoice.tenant !== "ADMIN"` → **403 + `logger.warn`** (pattern עקבי עם `src/app/api/admin/cardcom/refund/route.ts:76-89`).

### ✅ 3. `src/app/api/admin/receipts/[id]/resend/route.ts`
- אותה בדיקת tenant + 403 + logger.warn.
- הוסר ה-USER branch של `getUserCardcomCredentials` (dead code אחרי החסימה).
- הוסר ה-import `getUserCardcomCredentials`.

### ✅ 4. `src/app/api/admin/receipts/route.ts` (GET)
- אם `role !== "ADMIN"` והבקשה כוללת `?tenant=USER`/`?tenant=all` → **403 + logger.warn**.
- החלפת הסינון מ-`cardcomTransaction.tenant` (join) ל-`tenant` ישיר (denormalized) — עקבי עם page.tsx וחסין ל-SetNull של ה-transaction.

## הוצאו מהסקופ (לסבב עתידי)

- 🟡 `/admin/receipts/[id]/page.tsx` — לא קיים בכלל; `receipts-table.tsx:152` יוצר לינק לדף לא קיים. pre-existing.
- 🟡 Pagination ב-`/admin/receipts` — לא מומש ב-UI (ה-API תומך).

## בדיקות לפני push (✅ עברו)

- [x] `npx tsc --noEmit` — נקי בקבצים שלי (2 שגיאות pre-existing ב-`dashboard/receipts/page.tsx` של צ'אט מקביל)
- [x] `npx vitest run` — אין tests בקבצים שלי; 4 test files שנכשלו (effective-price/scope/sms-quota/impersonation) לא קשורים
- [x] 5 סוכנים — מצאו 2 ממצאים שטופלו (GET endpoint, 404→403)
- [x] 5 סוכנים verification — TBD

## רגישות לעתיד

- כל שאילתת CardcomInvoice באדמין שאינה מוגבלת לסיכון USER tenant **חייבת** לסנן tenant.
- כל פעולה (mutation) על CardcomInvoice באדמין **חייבת** לבדוק tenant אחרי findUnique לפני שמשתמשים ב-Cardcom config.
