# סקירה לביקורת — תשלום מצרפי באשראי דרך Cardcom (v3)

**תאריך:** 2026-05-07
**סטטוס:** מוכן לסקירה נוספת. **לא בוצע commit, לא בוצע push, לא בוצעה הרצת migration.**

---

## תיקון בודד שנעשה לאחר ביקורת v2

### ✅ ביקורת v2 #3 — AuditLog ייכתב גם על `processed = []`
**הבעיה:** הביקורת זיהתה שאם **כל** ה-bulkPaymentIds כבר שונו (כולם שולמו ידנית בין יצירה ל-webhook), `processed=[]` ו-`remainingAmount=amountPaid`. הקוד הקודם דילג על audit log → אדמין שיחפש את האירוע ב-AuditLog לא ימצא דבר.

**התיקון:** `src/app/api/webhooks/cardcom/user/route.ts` — שונה התנאי מ-
```typescript
if (distributionResult.success && distributionResult.processed.length > 0)
```
ל-
```typescript
if (distributionResult.success)
```

האירוע "ניסינו לחלק ולא היה מה לחלק" כעת מתועד גם הוא, עם `processedCount: 0` ו-`remainingAmount > 0` ב-details. ה-AdminAlert של remainder מספק את הפעולה הנדרשת; ה-AuditLog משלים את העקבות לחקירה רטרוספקטיבית.

---

## נושאים פתוחים מהביקורת החיצונית האחרונה (לפי בקשתך — להזכיר בסוף)

הביקורת זיהתה 8 סעיפים. סעיף 3 תוקן (לעיל). השאר ממתינים להחלטתך:

### לא חוסמים (ממתינים לתשובה):

**1. הסבר שגוי במסמך על `migrate deploy` ו-shadow DB.**
תיקון נדרש: shadow DB משמש רק `migrate dev`, לא `deploy`. הסיכון האמיתי במעבר ל-`migrate deploy` הוא **drift** בין מה ש-`db push` יצר ב-prod לבין קבצי המיגרציה. נדרש `prisma migrate resolve --applied` על migrations היסטוריים.
*פעולה:* תיקון טקסט במסמך + לא נוגע בקוד.

**2. `db push --accept-data-loss` בעת startup — לא "סיכון נמנע אוטומטית" בהיבט הכללי.**
לפיצ'ר הזה ספציפית — כן בטוח (ALTER ADD COLUMN idempotent). אבל אם בעתיד מישהו ימחק שדה מ-schema, הנתונים יילכו ללא אזהרה.
*פעולה:* תיעוד אזהרה כללית.

**4. רטרי טרנזיינטי יוצר תופעות לוואי כפולות.**
אם distribute נכשל ב-P2034 אחרי `withAudit` הצליח, Cardcom יבצע retry של ה-webhook. ב-retry:
- `Notification "תשלום התקבל"` ייווצר **שוב** (התראה כפולה למטפל).
- `CardcomInvoice` — אם יש unique constraint עליו, ייכשל; אחרת ייווצר כפול.
- מייל `sendEmail` — נשלח **שוב**.
- token upsert — idempotent (בסדר).
*פעולה מומלצת:* לעטוף את `notification.create` ו-`cardcomInvoice.create` בבדיקת קיום לפי `cardcomTransactionId`.
*תיקון:* 5–10 שורות.

**5. Chargeback אחרי bulk distribute — אין undo אוטומטי.**
המקרה: לקוח עושה chargeback אחרי שכבר חולק ל-N children. הקוד הקיים יוצר `ChargebackEvent` + `AdminAlert` (טוב), אבל הפיצ'ר החדש משאיר N×2 רשומות ב-PAID במערכת בעוד שהכסף הוחזר.
*פעולה מומלצת:* הוספת רשימת `bulkPaymentIds` + `processed[]` ל-`AdminAlert` של chargeback (כדי שהאדמין יידע מה ל-undo).
*תיקון:* 5 שורות ב-webhook.

**6. בלי GIN index — ביצועים יורדים עם הזמן.**
המסמך מדבר על "לא חוסם". זה נכון לטבלה קטנה. עם 100K rows (לא רחוק) — Seq Scan פר סלוק bulk ב-SERIALIZABLE TX יעלה את שיעור ה-conflicts. **הצעה מעשית:** להריץ ידנית ב-Render dashboard אחרי ה-deploy הראשון:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CardcomTransaction_bulkPaymentIds_idx"
ON "CardcomTransaction" USING GIN ("bulkPaymentIds");
```

**7. רשימת `git add` חסרה safety check.**
*פעולה מומלצת:* לפני commit להריץ
```bash
git status --porcelain | grep -E "^( M|MM|A )"
```
ולהשוות ידנית ל-21 השורות.

**8. אין tests + אין UI test.**
*המלצה:* unit test אחד על `distributeBulkCardcomPayment` (idempotency) + בדיקת UI ידנית של תרחיש PARTIAL לפני deploy.

---

## 4 השאלות שלך מההודעה הקודמת — עדיין פתוחות

(הזכרה כדי שתחליטי כשתחזרי)

| # | שאלה | המלצה שלי |
|---|------|-----------|
| 1 | איך להריץ migration על ה-DB? | **א.** לתת ל-`db push` של start:prod לרוץ; להריץ GIN ידנית אחרי deploy. |
| 2 | לבדוק UI בדפדפן לפני פוש? | **כן.** לפחות תרחיש PARTIAL אחד. |
| 3 | חובות טכניים #2/#4/#5 — לפתור עכשיו? | **לעתיד.** לא חוסמים את הפיצ'ר. |
| 4 | מי עושה commit + push? | **את** מאשרת, **אני** מבצע (עם רשימת `git add` ספציפית). |

---

## רשימת קבצים ששונו / נוצרו (סופי, ללא שינוי מ-v2)

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

**21 קבצים. אין שינויים נוספים בקבצי הצ'אט המקביל (Impersonation/Clinic transfer).**

---

## ⚠️ צ'אט מקביל — התעלמות מקבצים אלה

לא לעשות `git add .`. הקבצים הבאים **לא** שלי וצריכים להישאר ב-`Modified` (יקובלו על-ידי הצ'אט המקביל):
- `next.config.ts`, `src/app/page.tsx`, `src/components/providers.tsx`
- `src/lib/auth.ts`, `src/lib/audit.ts`, `src/lib/api-auth.ts`
- `src/app/api/admin/users/[id]/toggle-block/route.ts`
- `src/app/api/clinic-admin/members/[id]/route.ts`, `transfer-client/route.ts`
- `src/app/clinic-admin/members/page.tsx`, `transfer/page.tsx`
- `src/app/api/p/departure-choice/[token]/route.ts`
- כל ה-`?? src/app/(dashboard)/dashboard/settings/impersonation-history/`
- כל ה-`?? src/app/api/clinic-admin/impersonate/`
- כל ה-`?? src/app/api/clinic-admin/transfer-client/preview/`
- כל ה-`?? src/components/clinic-admin/`
- `?? src/components/impersonation-banner.tsx`
- `?? src/lib/transfer-cancel-or-delete.ts`
- `?? prisma/migrations/20260507100000_add_impersonation_session/`
- 4 קבצי `*.md` של תיעוד מצ'אט אחר.

---

## סיכום השינויים בין v2 ל-v3

- ✅ AuditLog נרשם גם כש-`processed = []` (תיקון 1 שורה).
- 📝 תיעוד 7 הסעיפים האחרים שעדיין דורשים החלטה.
- ⏸️ ממתין ל-4 שאלות פתוחות + תגובה לביקורת.
