# סקירה לביקורת — תשלום מצרפי באשראי דרך Cardcom (v4)

**תאריך:** 2026-05-07
**סטטוס:** מוכן לסקירה. **לא בוצע commit / push / migration.**

---

## תקציר השינויים מ-v3 → v4

עברנו מ-v3 (שכלל 2 תיקוני חובה + תיעוד) ל-v4 שכולל:
- ✅ **2 תיקוני קוד נוספים** מהביקורת החיצונית האחרונה (#4, #5).
- ✅ **5 תיקוני תיעוד** במסמך — תיקון אי-דיוקים והשלמת חובות שהיו חסרים.

---

## 🆕 תיקוני קוד שנוספו ב-v4

### ✅ תיקון א' — Guard נגד כפילויות ברטרי טרנזיינטי
**הבעיה (חוב #10 בביקורת):** אם distribute נכשל ב-`P2034` (serialization conflict), ה-webhook זורק → Cardcom retry. ה-`withAudit` כבר commit ב-DB (`umbrella → PAID`, `notification → נוצר`, `cardcomInvoice → נוצר`, `email → נשלח`). ב-retry, `withAudit` רץ שוב — ויוצר **התראה כפולה**, **מייל כפול**, **חשבונית כפולה**.

**התיקון:** `src/app/api/webhooks/cardcom/user/route.ts` — נוספה משתנה `isFirstApproval = transaction.status !== "APPROVED"` לפני ה-`withAudit`. אם זה retry (status כבר APPROVED מהריצה הקודמת), מדלגים על:
- `tx.notification.create` (שורה 437) → תוסף `&& isFirstApproval`.
- `tx.cardcomInvoice.create` (שורה 514) → תוסף `&& isFirstApproval`.
- `sendEmail` (שורה 692) → תוסף `&& isFirstApproval`.

**מה שנשאר idempotent כברירת מחדל:**
- `cardcomTransaction.update` — אותם ערכים בכל ריצה.
- `payment.update` (PAID) — idempotent.
- `savedCardToken` upsert — בדיקת `existing` כבר קיימת.

**Audit details קיבלו `isRetry: !isFirstApproval`** כדי לראות בלוג מה היה retry.

### ✅ תיקון ב' — Chargeback alert מפרט bulk context
**הבעיה (חוב #9 בביקורת):** אם לקוחה עושה chargeback אחרי distribute, `Cardcom` מחזירה את כל הסכום הכולל (אחד), אבל אצלנו יש N children PAID + N parents שונו ל-PAID. ה-AdminAlert הקודם לא מציין את הרשימה — אדמין צריך לחפש ידנית מה ל-undo.

**התיקון:** `src/app/api/webhooks/cardcom/user/route.ts` בבלוק `isReversal && transaction.status === "APPROVED"`:
- שאילתה מקדימה: `prisma.payment.findMany` של ה-children שכבר נוצרו ע"י distribute (לפי `parentPaymentId IN bulkPaymentIds` + `notes contains transaction.id`).
- אם זה chargeback מצרפי (`bulkPaymentIds.length > 0`):
  - **כותרת מובחנת:** `[cardcom-chargeback-bulk]` במקום `[cardcom-chargeback]`.
  - **הודעה מפורטת:** מציינת מספר ה-children + מספר ה-parents שצריכים rollback.
  - **actionRequired:** הוראות rollback ספציפיות.
  - **metadata:** `isBulk: true`, `bulkPaymentIds`, `bulkChildren: [{id, parentPaymentId, amount}]`, `amountCharged`.
- אם זה chargeback רגיל — ההתנהגות הקודמת ללא שינוי (alertSubtype = `chargeback`).

---

## 📝 תיקוני תיעוד שנוספו ב-v4

### 1. הסבר migrate deploy (ביקורת #1)
**שגיאה ב-v3:** "מעבר ל-`prisma migrate deploy`... נדרש בדיקה שה-migrations הקיימים נקיים מ-shadow DB conflict."
**תיקון נכון ב-v4:** `migrate deploy` **לא** משתמש ב-shadow DB (זה רק ל-`migrate dev` שמייצר migrations חדשים). הסיכון האמיתי במעבר ל-`migrate deploy` הוא **drift**: יתכן ש-`db push` יצר ב-prod סכמה שונה ממה שכתוב ב-`prisma/migrations/`. נדרש `prisma migrate resolve --applied <name>` על migrations היסטוריים שלא רצו דרך migrate.

### 2. הסתייגות `db push --accept-data-loss` (ביקורת #2)
**הבהרה ב-v4:** הפיצ'ר הזה ספציפית בטוח (`ALTER ADD COLUMN IF NOT EXISTS` idempotent). **אבל** המנגנון הכללי לא בטוח:
- אם schema יקטן בעתיד (מישהו ימחק שדה), `accept-data-loss` יפיל את הנתונים בלי אזהרה.
- אם 2 instances של Render עולים במקביל → race ב-`DROP COLUMN`/`ALTER TYPE`.
- `db push` לא יוצר GIN/raw SQL indexes ממיגרציה.

### 3. תיעוד הסיכון של chargeback אחרי distribute (ביקורת #5) — **תוקן בקוד**
מתועד גם בסעיף "תיקון ב'" לעיל. במסמך v4 זה לא חוב פתוח אלא תיקון מבוצע.

### 4. תיעוד הסיכון של notification/email/invoice כפולים (ביקורת #4) — **תוקן בקוד**
מתועד גם בסעיף "תיקון א'" לעיל. במסמך v4 זה לא חוב פתוח אלא תיקון מבוצע.

### 5. Bash safety check לפני commit (ביקורת #7)
**נוסף למסמך:** לפני commit להריץ:
```bash
git status --porcelain | grep -E "^( M|MM|A )"
```
ולוודא שהפלט תואם ל-21 השורות ברשימת `git add` (ראה בהמשך). הצ'אט המקביל (Impersonation/Clinic transfer) משנה קבצים אחרים, וזה מונע התערבות.

---

## חובות טכניים שעדיין פתוחים (לא תוקנו ב-v4)

### חוב #2 — Idempotency על `notes contains` (ביקורת קודמת)
**ההמלצה:** עמודה ייעודית `sourceCardcomTransactionId String?` על Payment + `@@index`. פתרון נקי לטווח ארוך.
**סטטוס:** לא דחוף, פתרון נוכחי עובד תחת SERIALIZABLE.

### חוב #4 — חלון "umbrella PAID, children PENDING" (ביקורת קודמת)
**ההמלצה:** polling/refresh ב-UI אחרי תשלום. Known limitation.
**סטטוס:** לא חוסם.

### חוב #5 — סינון ב-12 קבצים, חוסר guardrail (ביקורת קודמת)
**ההמלצה:** עמודת `kind: PaymentKind` או ESLint custom rule.
**סטטוס:** עובד היום, חוב טכני לטווח בינוני.

### חוב #7 — Single product line vs פירוט פגישות (ביקורת קודמת)
**ההמלצה:** ב-FULL לפצל ל-products לפי פגישות.
**סטטוס:** UX nice-to-have.

### חוב #8 — אין tests (ביקורת קודמת)
**ההמלצה:** unit test על `distributeBulkCardcomPayment` (idempotency, partial allocation, transient errors).
**סטטוס:** לא נכתב, ב-PR נפרד.

### חוב #6 — GIN index ידנית ב-Render (ביקורת אחרונה)
**ההמלצה:** להריץ אחרי deploy ראשון:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CardcomTransaction_bulkPaymentIds_idx"
ON "CardcomTransaction" USING GIN ("bulkPaymentIds");
```
**סטטוס:** דקה אחת, מומלץ אחרי deploy.

---

## רשימת קבצים ששונו / נוצרו (סופי, ללא שינוי מ-v2/v3 פרט ל-`webhooks/cardcom/user/route.ts` שעודכן)

```bash
# Safety check ראשון — לפני commit:
git status --porcelain | grep -E "^( M|MM|A )"
# יש להשוות שורה-שורה ל-21 הקבצים למטה. אם מופיע משהו אחר — STOP.

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
git add 'src/app/(dashboard)/dashboard/page.tsx'
git add 'src/app/(dashboard)/dashboard/reports/page.tsx'
git add 'src/app/(dashboard)/dashboard/clients/[id]/page.tsx'
```

**21 קבצים. אסור `git add .` בגלל הצ'אט המקביל.**

---

## ⚠️ צ'אט מקביל — קבצים שאסור לגעת בהם

- `next.config.ts`, `src/app/page.tsx`, `src/components/providers.tsx`
- `src/lib/auth.ts`, `src/lib/audit.ts`, `src/lib/api-auth.ts`
- `src/app/api/admin/users/[id]/toggle-block/route.ts`
- `src/app/api/clinic-admin/members/[id]/route.ts`, `transfer-client/route.ts`
- `src/app/clinic-admin/members/page.tsx`, `transfer/page.tsx`
- `src/app/api/p/departure-choice/[token]/route.ts`
- כל `?? src/app/(dashboard)/dashboard/settings/impersonation-history/`
- כל `?? src/app/api/clinic-admin/impersonate/`
- כל `?? src/app/api/clinic-admin/transfer-client/preview/`
- כל `?? src/components/clinic-admin/`
- `?? src/components/impersonation-banner.tsx`
- `?? src/lib/transfer-cancel-or-delete.ts`
- `?? prisma/migrations/20260507100000_add_impersonation_session/`
- 4 קבצי `*.md` של תיעוד מצ'אט אחר.

---

## סיכום מ-v3 ל-v4

| נושא | v3 | v4 |
|------|----|----|
| AuditLog על `processed=[]` | ✅ | ✅ |
| Remainder alert | ✅ | ✅ |
| Notification/email/invoice כפולים ברטרי | ❌ | ✅ **תוקן** |
| Chargeback מפרט bulk context | ❌ | ✅ **תוקן** |
| הסבר migrate deploy/shadow DB | שגוי | ✅ תוקן |
| `db push --accept-data-loss` הסתייגות | חסרה | ✅ נוסף |
| Bash safety check לפני commit | חסר | ✅ נוסף |
| GIN index ידני ב-Render | מתועד | מתועד |
| חובות #2/#4/#5/#7/#8 | מתועדים | מתועדים |

---

**ממתין לאישור הסקירה (Cursor) + סוכן בדיקה פנימי לפני commit/push.**
