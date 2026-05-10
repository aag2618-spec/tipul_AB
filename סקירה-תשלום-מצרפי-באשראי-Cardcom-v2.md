# סקירה לביקורת — תשלום מצרפי באשראי דרך Cardcom (v2 — אחרי ביקורת חיצונית)

**תאריך:** 2026-05-07
**סטטוס:** מוכן לסקירה נוספת. **לא בוצע commit, לא בוצע push, לא בוצעה הרצת migration.**

---

## רקע

זוהי גרסה שנייה של הסקירה. הראשונה אושרה ע"י 5 סוכנים מקבילים × 3 סבבים, אבל ביקורת חיצונית (Cursor/AI אחר) זיהתה 6 בעיות אמיתיות שלא עלו בסבבי הסוכנים. שלוש מתוכן (חובה) תוקנו; שלוש (חוב טכני) מתועדות כאן ולא נסגרו בקוד.

---

## תיקונים שבוצעו לפי הביקורת החיצונית

### ✅ תיקון #1 — AdminAlert על `remainingAmount > 0` (חובה)
**הבעיה:** distribute יכול להחזיר `success: true` עם `remainingAmount > 0` (אם בין יצירת ה-umbrella ל-webhook אחת מהפגישות שולמה ידנית או שינתה סטטוס). הכסף נגבה ב-Cardcom, ה-umbrella PAID, אבל לא חולק במלואו — והאדמין לא יודע.
**התיקון:** `src/app/api/webhooks/cardcom/user/route.ts` — נוסף `AdminAlert(URGENT)` חדש בסוג `bulk_distribution_remainder` שמופעל כש-`distributionResult.success && remainingAmount > 0.01`.
**ההודעה כוללת:** סכום שנגבה, סכום שלא חולק, מספר פגישות שעובדו / לא, ופעולה מומלצת (חילוק ידני / העברה לקרדיט).

### ✅ תיקון #3 — AuditLog על distribute (חובה)
**הבעיה:** יצירת N child Payments + עדכון N parents מ-PENDING ל-PAID רצה **מחוץ ל-`withAudit`** של ה-webhook (כי `distributeBulkCardcomPayment` משתמש ב-`prisma.$transaction` משלו עם isolation שונה — Prisma לא תומך nested). אין רשומת AuditLog על עיבוד הכסף.
**התיקון:** `src/app/api/webhooks/cardcom/user/route.ts` — נוספה קריאה ל-`prisma.adminAuditLog.create` ידנית אחרי distribute, עם:
- `adminId: null`, `adminName: "[SYSTEM:WEBHOOK_CARDCOM]"` (אותו דפוס כמו `withAudit` עם system actor).
- `action: "cardcom_user_bulk_distribute"`, `targetType: "payment"`, `targetId: umbrellaPaymentId`.
- `details` מלאים: `cardcomTransactionId`, `umbrellaPaymentId`, `amountPaid`, `processedCount`, רשימת `processed` (parentId/childId/amountPaid/isFullyPaid לכל אחד), `remainingAmount`, `externalRef: LowProfileId`.
- best-effort: כשל ברישום לא יבטל את ה-PAID של ה-umbrella (רק logger.error).

### 📝 תיקון #6 — Migration ב-pipeline (תיעוד + המלצה, **לא שינוי קוד**)
**הבעיה:** הקוד החדש קורא ל-`transaction.bulkPaymentIds` — אם הקוד נפרס ל-prod **לפני** שהעמודה קיימת, **כל** webhook של Cardcom (כולל המסלול הישן) ייכשל עם "Unknown column".
**מצב נוכחי בפרויקט:**
```
"start:prod": "prisma db push --accept-data-loss && ... && next start"
```
- `db push --accept-data-loss` מסנכרן את ה-DB לפי `schema.prisma` בעת ה-startup. זה אומר שהעמודה `bulkPaymentIds` **תיווצר** בעת deploy (כי היא ב-schema). הסיכון של "Unknown column" **נמנע באופן אוטומטי** ב-pipeline הקיים.
- **אבל:** ה-GIN index שמוגדר ב-migration SQL **לא יווצר** (כי `db push` לא מריץ migrations). ה-race-guard ב-`charge-cardcom-bulk` שמשתמש ב-`hasSome` יעבוד אבל יתבסס על Seq Scan.
**המלצה (לא בוצעה — דורש החלטה):**
- מעבר ל-`prisma migrate deploy` בpipeline: `"start:prod": "prisma migrate deploy && next start"`. נדרש בדיקה שה-migrations הקיימים נקיים מ-shadow DB conflict.
- חלופה: להריץ את ה-GIN index ידנית ב-Render dashboard / psql בעת ה-deploy.

---

## חובות טכניים שתועדו (לא תוקנו — דורשים החלטה)

### 📝 חוב #2 — Idempotency על `notes contains` (Cursor #2)
**הבעיה:** ה-idempotency guard ב-`distributeBulkCardcomPayment` מבוסס על `notes: { contains: cardcomTransactionId }`. זה עובד תחת SERIALIZABLE TX, אבל:
- `notes` הוא free-text — אין שום מניעה שמשתמש יכניס cuid לשם (סיכוי קטן אך קיים).
- ה-`contains` לא ממומש על index → scan על children.
- שינוי בטקסט ההערה שובר את ה-guard בשקט.

**המלצה לעתיד:**
- עמודה ייעודית `sourceCardcomTransactionId String?` על Payment + `@@index` (או partial unique עם parentPaymentId).
- מאפשר join ב-audit + DB-level constraint (לא רק application-level).

### 📝 חוב #4 — חלון "umbrella PAID, children PENDING" (Cursor #4)
**ה-known limitation:** בין סיום `withAudit` (umbrella → PAID + Notification נשלחת + מייל "תשלום התקבל" יוצא) לבין סיום distribute (children → PAID), יש חלון קצר (בדרך כלל מילישניות, אבל יכול להגיע ל-30s+ אם distribute נופל על P2034 ו-Cardcom retries).
**במהלך החלון:**
- `EXCLUDE_BULK_UMBRELLA_WHERE` + `parentPaymentId: null` מסנן נכון את ה-umbrella.
- אבל ה-children עדיין מציגים PENDING.
- `COLLECT_PAYMENT` tasks לא נסגרו עדיין.
- המטפל יכול לראות "חוב פתוח" + "משימת גבייה" על מטופל ששילם.
- מייל "תשלום התקבל" כבר נשלח.

**המלצות לעתיד:**
- polling/refresh ב-UI אחרי תשלום באשראי.
- או: העברת ה-distribute לתוך `withAudit` (משמעותית — דורש פיצול ה-isolation; Prisma לא תומך nested).

### 📝 חוב #5 — סינון ב-12 קבצים, חוסר guardrail (Cursor #5)
**הבעיה:** הסינון `EXCLUDE_BULK_UMBRELLA_WHERE` יושם ידנית ב-12 מקומות. כל קוד חדש (cron, דוח שנתי, גרף, ייצוא) ש-`prisma.payment.findMany` ולא יוסיף את הסינון — יחזיר סכום שגוי. lint/type-check לא יתפסו את זה.

**המלצות לעתיד:**
- עמודה `kind: PaymentKind` (NORMAL / BULK_UMBRELLA / FUTURE_TYPES) במקום סינון על free-text. + partial index `WHERE kind <> 'BULK_UMBRELLA'`.
- חלופה: Prisma extension/middleware שמוסיף את הסינון אוטומטית ב-`payment.findMany` (זהירות מ-raw queries).
- חלופה זולה: ESLint custom rule שמתריע על `prisma.payment.findMany` ללא הסינון.

### 📝 שיפור #7 — Single product line vs פירוט פגישות (Cursor #7)
**הבעיה:** `charge-cardcom-bulk` שולח ל-Cardcom שורת מוצר אחת (totalAmount). זה פותר את `sum(products) ≠ Amount` ב-PARTIAL, אבל ב-FULL מאבד פירוט שיכול להיות שימושי בקבלה (תאריכי פגישות).
**המלצה לעתיד:** ב-FULL mode (totalAmount === totalDebt) — לפצל ל-products לפי פגישות; ב-PARTIAL — להישאר עם שורה אחת.

### 📝 חוב #8 — אין unit tests (Cursor #8)
**הבעיה:** אין tests על `distributeBulkCardcomPayment` (idempotency, partial allocation, transient/non-transient errors) ולא על `charge-cardcom-bulk`. 3 סבבי סוכנים = static analysis בלבד.
**המלצה:** unit tests עם Prisma mock/SQLite.

---

## רשימת קבצים ששונו / נוצרו (סופי)

| קובץ | פעולה |
|------|-------|
| `prisma/schema.prisma` | EDIT — `bulkPaymentIds` |
| `prisma/migrations/20260507000001_.../migration.sql` | NEW — ALTER + GIN index |
| `src/app/api/payments/charge-cardcom-bulk/route.ts` | NEW |
| `src/lib/payments/bulk-payment.ts` | EDIT — `distributeBulkCardcomPayment` (SERIALIZABLE + transient) |
| `src/lib/payments/types.ts` | EDIT — `BULK_UMBRELLA_NOTES_PREFIX` + `EXCLUDE_BULK_UMBRELLA_WHERE` |
| `src/lib/payments/receipt-service.ts` | EDIT — סינון Umbrella |
| `src/app/api/webhooks/cardcom/user/route.ts` | EDIT — distribution + transient retry + **AuditLog** + **AdminAlert remainder** |
| `src/components/payments/charge-cardcom-dialog.tsx` | EDIT — bulk mode |
| `src/components/payments/pay-client-debts.tsx` | EDIT — הסרת חסימה + ChargeCardcomDialog |
| `src/components/clients/pay-debt-button.tsx` | EDIT — הסרת Dialog חיצוני |
| `src/app/api/payments/route.ts` | EDIT — סינון Umbrella |
| `src/app/api/payments/pay-client-debts/route.ts` | EDIT — טקסט חסימה |
| `src/app/api/payments/monthly-total/route.ts` | EDIT — סינון Umbrella |
| `src/app/api/payments/paid-history/route.ts` | EDIT — סינון Umbrella |
| `src/app/api/payments/export/route.ts` | EDIT — סינון Umbrella |
| `src/app/api/clients/[id]/bulk-payment/route.ts` | EDIT — טקסט חסימה |
| `src/app/api/clients/[id]/send-payment-history/route.ts` | EDIT — סינון Umbrella |
| `src/app/api/cron/notifications/route.ts` | EDIT — סינון Umbrella (3 שאילתות) |
| `src/app/(dashboard)/dashboard/page.tsx` | EDIT — סינון Umbrella |
| `src/app/(dashboard)/dashboard/reports/page.tsx` | EDIT — סינון Umbrella |
| `src/app/(dashboard)/dashboard/clients/[id]/page.tsx` | EDIT — סינון Umbrella |

**סך הכל:** 21 קבצים (1 חדש = API, 1 חדש = migration, 19 EDIT).

---

## ⚠️ הקפדה — צ'אט מקביל

זוהה בצ'אט מקביל פיצ'רים אחרים שבעבודה (לא לגעת):
- Impersonation system (`src/lib/auth.ts`, `src/lib/audit.ts`, `src/lib/api-auth.ts`, `src/components/impersonation-banner.tsx`, `src/app/(dashboard)/dashboard/settings/impersonation-history/`, `src/app/api/clinic-admin/impersonate/`, `prisma/migrations/20260507100000_add_impersonation_session/`).
- Clinic transfer-client (`src/app/api/clinic-admin/transfer-client/preview/`, `src/lib/transfer-cancel-or-delete.ts`).
- שינויים ב-`next.config.ts`, `src/app/page.tsx`, `src/app/api/p/departure-choice/[token]/route.ts`, `src/components/providers.tsx`.

**בעת commit:** להוסיף **רק את הקבצים שלי לפי שמות מפורשים**, לא `git add .`. מצורף רשימה מסודרת:

```
git add prisma/schema.prisma
git add prisma/migrations/20260507000001_add_bulk_payment_ids_to_cardcom_tx
git add src/app/api/payments/charge-cardcom-bulk
git add src/lib/payments/bulk-payment.ts
git add src/lib/payments/types.ts
git add src/lib/payments/receipt-service.ts
git add src/app/api/webhooks/cardcom/user/route.ts
git add src/components/payments/charge-cardcom-dialog.tsx
git add src/components/payments/pay-client-debts.tsx
git add src/components/clients/pay-debt-button.tsx
git add src/app/api/payments/route.ts
git add src/app/api/payments/pay-client-debts/route.ts
git add src/app/api/payments/monthly-total/route.ts
git add src/app/api/payments/paid-history/route.ts
git add src/app/api/payments/export/route.ts
git add src/app/api/clients/[id]/bulk-payment/route.ts
git add src/app/api/clients/[id]/send-payment-history/route.ts
git add src/app/api/cron/notifications/route.ts
git add src/app/\(dashboard\)/dashboard/page.tsx
git add src/app/\(dashboard\)/dashboard/reports/page.tsx
git add src/app/\(dashboard\)/dashboard/clients/\[id\]/page.tsx
```

---

## פעולות שטרם בוצעו

1. **Migration על ה-DB.** אופציות:
   - **אם נשארים עם `start:prod` הנוכחי:** ה-`db push` של ה-deploy ייצור את העמודה אוטומטית; ה-GIN index לא יווצר → ביצועים ירודים מעט (לא חוסם).
   - **מעבר ל-`migrate deploy`:** דורש בדיקה שה-shadow DB error לא יחזור בעת deploy.
   - **הרצה ידנית:** `npx prisma migrate deploy` או SQL ידני מ-Render dashboard.

2. **בדיקת UI ידנית בדפדפן** — לא בוצעה (Auto mode). דרושה בדיקה end-to-end:
   - תשלום בודד (FULL): payment 1 × 300₪.
   - תשלום מצרפי FULL: 5 פגישות × 300₪.
   - תשלום מצרפי PARTIAL: סכום חלקי על 5 פגישות.
   - בכל אחד: link mode + iframe mode.

3. **commit + push** — רק לאחר אישורך, ולאחר העדפותיך לגבי המעבר ל-`migrate deploy`.

---

## סיכום שינויים מאז גרסה 1

- ✅ AdminAlert על remainingAmount > 0
- ✅ AuditLog ידני על distribute
- 📝 תיעוד מלא של 5 חובות טכניים + המלצות
- 📝 תיעוד הצ'אט המקביל ורשימת `git add` ספציפית
