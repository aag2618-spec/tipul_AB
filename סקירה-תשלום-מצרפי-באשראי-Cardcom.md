# סקירה לביקורת — תשלום מצרפי באשראי דרך Cardcom

**תאריך:** 2026-05-07
**מטרת השינוי:** לאפשר חיוב באשראי בדיאלוג "תשלום חובות" (כשיש כמה פגישות / חוב חלקי) — בדיוק כמו שעובד בסליקת תשלום בודד היום.

**סטטוס:** ✅ **3 סבבי בדיקה הושלמו (5 סוכנים בכל סבב). כל הבעיות שהסוכנים מצאו תוקנו. אישור לפוש.**

---

## סקירת אדריכלות — "Umbrella Payment"

```
┌──────────────────────────────────────────────────────────────────────┐
│ ChargeCardcomDialog (UI) — bulkPaymentIds=[X1..Xn]                   │
│       │                                                              │
│       ▼ POST /api/payments/charge-cardcom-bulk                       │
│ ┌──────────────────────────────────────────────────────────────┐     │
│ │ SERIALIZABLE TX:                                             │     │
│ │   1. בודק שאין CardcomTx פתוח על אף פגישה (race guard)       │     │
│ │   2. יוצר Umbrella Payment (PENDING, CREDIT_CARD)            │     │
│ │      notes="[BULK_UMBRELLA] ..." → מסונן מתצוגות סיכום      │     │
│ │   3. יוצר CardcomTransaction עם paymentId=umbrella +         │     │
│ │      bulkPaymentIds=[X1..Xn]                                 │     │
│ └──────────────────────────────────────────────────────────────┘     │
│       │                                                              │
│       ▼ Cardcom createPaymentPage(amount=totalAmount)                │
│ ┌────────────────────┐                                               │
│ │ Cardcom LowProfile │  (לקוח משלם בקישור / iframe)                  │
│ └────────────────────┘                                               │
│       │                                                              │
│       ▼ Webhook → /api/webhooks/cardcom/user                         │
│ ┌──────────────────────────────────────────────────────────────┐     │
│ │ withAudit:                                                   │     │
│ │   • CardcomTransaction.status = APPROVED                     │     │
│ │   • Umbrella Payment.status = PAID + receiptUrl              │     │
│ │   • CardcomInvoice (קבלה אחת על totalAmount)                  │     │
│ │ אחרי withAudit:                                              │     │
│ │   • distributeBulkCardcomPayment(...) ב-SERIALIZABLE TX     │     │
│ │     - idempotency guard בתוך ה-TX                            │     │
│ │     - יוצר child Payment לכל X1..Xn (PAID)                    │     │
│ │     - X.status = PAID/PENDING לפי ההקצאה                      │     │
│ │   • על P2034/40001/deadlock — webhook זורק → Cardcom retry │     │
│ │     (לא AdminAlert)                                          │     │
│ └──────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## רשימת השינויים

### 1. Schema + Migration
- **`prisma/schema.prisma`** (מודל `CardcomTransaction`):
  הוספת `bulkPaymentIds String[] @default([])` — רשימת payments אמיתיים שצריך לסמן PAID אחרי webhook.
- **`prisma/migrations/20260507000001_add_bulk_payment_ids_to_cardcom_tx/migration.sql`** (חדש):
  - `ALTER TABLE` — מוסיף עמודה.
  - `CREATE INDEX ... USING GIN ("bulkPaymentIds")` — לתמיכה ב-`hasSome` race guard.
- **Prisma client** — רוענן (`npx prisma generate`). **לא בוצע push ל-DB ללא אישור.**

### 2. API חדש — `src/app/api/payments/charge-cardcom-bulk/route.ts`
מסלול חדש שעובד לפי הדפוס של `charge-cardcom`:
- requireAuth + scopeUser + secretaryCan(canIssueReceipts)
- Idempotency-Key
- Shabbat block, ILS-only, businessIdNumber check, ACCRUAL block
- ולידציה: כל ה-payments PENDING + clientId תואם + scope + סך החיוב ≤ סך החובות
- SERIALIZABLE TX race guard (paymentId direct + bulkPaymentIds.hasSome)
- יוצר Umbrella Payment עם **notes שמתחיל ב-`[BULK_UMBRELLA]`**
- Cardcom createPaymentPage + URL validation (cardcom domain only)
- withAudit + Idempotency-Key persistence

### 3. פונקציה חדשה — `src/lib/payments/bulk-payment.ts`
**`distributeBulkCardcomPayment`**:
- **SERIALIZABLE `prisma.$transaction`** — guard idempotency (notes contains cardcomTransactionId) + יצירת children + עדכון parents — הכל אטומי.
- מחזיר `transient: boolean` על P2034/40001/deadlock — webhook יזרוק לCardcom retry.
- כשל לא-זמני → `success: false, error` → AdminAlert.

### 4. Webhook — `src/app/api/webhooks/cardcom/user/route.ts`
- import `distributeBulkCardcomPayment`.
- **אחרי `withAudit`**: אם `success && bulkPaymentIds.length > 0 && paymentId` → קריאה ל-distribution.
- **אם `transient: true`** → `throw` כדי שCardcom יבצע retry (לא finalizeWebhook).
- אחרת → AdminAlert URGENT + לוג.

### 5. UI — `src/components/payments/charge-cardcom-dialog.tsx`
- prop חדש `bulkPaymentIds?: string[]` + `isBulk` flag.
- ב-`startCardcom`: branching בין `/api/payments/[id]/charge-cardcom` (בודד) ל-`/api/payments/charge-cardcom-bulk` (מצרפי).
- בקבלת תגובה: `umbrellaPaymentId` נשמר כ-`paymentId` המקומי כך ש-`send-cardcom-link`, polling, sync, cancel — כולם פועלים על ה-umbrella.
- DialogDescription מציג "תשלום מצרפי על N פגישות" במצב bulk.

### 6. UI — `src/components/payments/pay-client-debts.tsx`
- import של `ChargeCardcomDialog`.
- הסרת החסימה `"תשלום מצרפי באשראי טרם נתמך"`.
- ב-`handlePaymentClick`: אם CREDIT_CARD → `startCardcomFlow` (במקום `executePayment`).
- **`startCardcomFlow`** סוגר את הדיאלוג הראשי + פותח `ChargeCardcomDialog` עם `paymentId` (בודד) או `bulkPaymentIds` (מצרפי).
- חסימת קומבינציה לא נתמכת: useCredit + CREDIT_CARD → toast.error.

### 7. UI — `src/components/clients/pay-debt-button.tsx`
- הוסר ה-`Dialog` החיצוני שעטף את `PayClientDebts` (גרם לקונפליקט z-index).

### 8. סינון Umbrella בכל תצוגות הסיכום (12 קבצים)
**בעיה:** Umbrella PAID + ה-children PAID = כפל הצגה בסיכומים.
**פתרון:** קבועים חדשים ב-`src/lib/payments/types.ts`:
- `BULK_UMBRELLA_NOTES_PREFIX = "[BULK_UMBRELLA]"`
- `EXCLUDE_BULK_UMBRELLA_WHERE = { NOT: { notes: { startsWith: ... } } }`

הסינון הוחל ב:
- `src/app/api/payments/route.ts` (מזין `/dashboard/receipts`)
- `src/app/api/payments/monthly-total/route.ts`
- `src/app/api/payments/paid-history/route.ts`
- `src/app/api/payments/export/route.ts` (CSV לרו"ח)
- `src/app/api/clients/[id]/send-payment-history/route.ts`
- `src/app/api/cron/notifications/route.ts` (3 שאילתות)
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/reports/page.tsx`
- `src/app/(dashboard)/dashboard/clients/[id]/page.tsx`
- `src/lib/payments/bulk-payment.ts` (`getClientDebtSummary` + `getAllClientsDebtSummary`)
- `src/lib/payments/receipt-service.ts` (חישוב remainingDebt למייל)

### 9. Defense-in-depth — `src/app/api/payments/pay-client-debts/route.ts` ו-`src/app/api/clients/[id]/bulk-payment/route.ts`
- החסימה של `CREDIT_CARD` נשארה (defense-in-depth) — טקסט עודכן: "תשלום באשראי חייב לעבור דרך מסך הסליקה".

---

## סבבי בדיקה — 5 סוכנים מקבילים × 3 סבבים

### סבב 1 — מצא 4 בעיות אמיתיות:
1. ✅ **כפל הצגה ב-monthly-total/paid-history/export** → תוקן (סינון Umbrella).
2. ✅ **`pay-debt-button.tsx` Dialog חיצוני** → תוקן.
3. ✅ **idempotency race ב-distribute (לפני TX)** → תוקן (SERIALIZABLE).
4. ✅ **חסר GIN index** → נוסף ל-migration.

### סבב 2 — מצא 3 בעיות נוספות:
1. ✅ **`api/payments/route.ts` לא סונן (מזין דף קבלות)** → תוקן.
2. ✅ **חסר טיפול P2034/40001 ב-distribute** → תוקן (transient flag + throw מ-webhook).
3. ✅ **`cron/notifications` חסר הגנה** → תוקן.

### סבב 3 — אישור סופי:
- כל הבעיות תוקנו. עוד edge case קטן (`receipt-service.ts:404`) → תוקן (סינון Umbrella בחישוב remainingDebt).
- **סוכן: "אישור לפוש: כן"**.

---

## רשימת קבצים ששונו / נוצרו

| קובץ | פעולה |
|------|-------|
| `prisma/schema.prisma` | EDIT — `bulkPaymentIds` |
| `prisma/migrations/20260507000001_.../migration.sql` | NEW — `ALTER TABLE` + GIN index |
| `src/app/api/payments/charge-cardcom-bulk/route.ts` | NEW |
| `src/lib/payments/bulk-payment.ts` | EDIT — `distributeBulkCardcomPayment` + EXCLUDE_BULK_UMBRELLA |
| `src/lib/payments/types.ts` | EDIT — קבועי Umbrella |
| `src/lib/payments/receipt-service.ts` | EDIT — סינון Umbrella |
| `src/app/api/webhooks/cardcom/user/route.ts` | EDIT — distribution + transient retry |
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
| `src/app/api/cron/notifications/route.ts` | EDIT — סינון Umbrella |
| `src/app/(dashboard)/dashboard/page.tsx` | EDIT — סינון Umbrella |
| `src/app/(dashboard)/dashboard/reports/page.tsx` | EDIT — סינון Umbrella |
| `src/app/(dashboard)/dashboard/clients/[id]/page.tsx` | EDIT — סינון Umbrella |

---

## פעולות שטרם בוצעו (דורשות אישור)

1. **הרצת migration על ה-DB** — `npx prisma migrate dev` נכשל (shadow DB error בגלל migration ישן). `db push` נדחה ע"י סביבת ההרצה. דרכי הרצה אפשריות:
   - `npx prisma migrate deploy` בענן (Render) — בטוח כי לא משתמש ב-shadow.
   - הרצה ידנית של ה-SQL דרך psql/Render dashboard.
2. **בדיקת UI בדפדפן** — לא בוצע (Auto mode).
3. **`git push`** — אחרי אישורך + הרצת migration על ה-DB.
