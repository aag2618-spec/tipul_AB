# תוכנית: בניית PaymentService מרכזי ("גזע וענפים")

## תאריך: 13/03/2026
## פרויקט: tipul_AB - מערכת ניהול מטופלים למטפלים
## Stack: Next.js 14+ (App Router), TypeScript, Prisma, PostgreSQL

---

## 1. הבעיה הנוכחית

### מה שבור
המערכת מכילה **5 API routes שונים** שיוצרים/מעדכנים תשלומים, וכל אחד עושה את זה **אחרת**:

| API Route | מה עושה כשכבר יש תשלום | child payment? | קבלה? | מייל? |
|-----------|----------------------|----------------|-------|-------|
| `POST /api/payments` | **דורס** את הסכום הקיים | לא | כן | כן |
| `PUT /api/payments/[id]` | **מוסיף** child payment | **כן** | כן | כן |
| `POST /api/payments/pay-client-debts` | **מעלה** סכום ישירות | לא | כן | כן |
| `POST /api/clients/[id]/bulk-payment` | **מעלה** סכום ישירות | לא | לא | לא |
| `PUT /api/sessions/[id]` | יוצר payment ראשוני | לא רלוונטי | לא | לא |

### תוצאה
- תשלומים חלקיים "נעלמים" - הסכום יורד אבל אין רשומה
- דף התשלומים הכללי מציג נכון, תיקיית מטופל לא
- ביומן לפעמים שגיאה ביצירת תשלום (דריסת תשלום קיים)

### מה צריך לקרות
**כל תשלום חלקי, מכל מקום, חייב ליצור child payment** - כמו ש-`PUT /api/payments/[id]` כבר עושה נכון.

---

## 2. מבנה ה-Payment ב-Prisma

```prisma
model Payment {
  id             String        @id @default(cuid())
  amount         Decimal       @db.Decimal(10, 2) // סכום ששולם (מצטבר ב-parent)
  expectedAmount Decimal?      @db.Decimal(10, 2) // סכום מלא
  paymentType    PaymentType   @default(FULL)
  method         PaymentMethod
  status         PaymentStatus @default(PENDING)
  receiptUrl     String?
  receiptNumber  String?
  hasReceipt     Boolean       @default(false)
  notes          String?
  paidAt         DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  clientId        String
  client          Client         @relation(...)
  sessionId       String?        @unique
  session         TherapySession? @relation(...)
  parentPaymentId String?
  parentPayment   Payment?       @relation("PaymentChildren", ...)
  childPayments   Payment[]      @relation("PaymentChildren")
}
```

**חשוב:** `sessionId` הוא `@unique` - רק payment אחד לכל session. ה-children לא מקבלים sessionId.

---

## 3. ארכיטקטורת הגזע וענפים

```
                    ┌─── יומן (calendar/page.tsx)
                    │      3 מסלולים: "עדכן ושלם", "עדכן ורשום חוב", סטטוס+תשלום
                    │
                    ├─── פגישות היום (today-session-card.tsx)
                    │      אותם 3 מסלולים
                    │
                    ├─── תצוגת פגישות (sessions-view.tsx)
                    │      אותם 3 מסלולים + ביטול עם חיוב
                    │
                    ├─── QuickMarkPaid (quick-mark-paid.tsx)
     "ענפים"       │      תשלום מלא/חלקי לפגישה בודדת
   (UI + API       │
    routes)        ├─── Complete Session (complete-session-dialog.tsx)
                    │      תשלום בסיום פגישה
                    │
                    ├─── PayClientDebts (pay-client-debts.tsx)
                    │      → POST /api/payments/pay-client-debts
                    │
                    ├─── Bulk Payment
                    │      → POST /api/clients/[id]/bulk-payment
                    │
                    └─── דף תשלום חדש + Mark Paid
                           → POST /api/payments, PUT /api/payments/[id]
                              │
                              ▼
                    ┌──────────────────────────────────────┐
                    │         PaymentService               │
      "גזע"       │         (src/lib/payment-service.ts)  │
                    │                                      │
                    │  createPaymentForSession()           │
                    │  addPartialPayment()                 │
                    │  markFullyPaid()                     │
                    │  processMultiSessionPayment()        │
                    │  issueReceipt()                      │
                    │  sendPaymentEmail()                  │
                    │  calculateClientDebt()               │
                    └──────────┬───────────────────────────┘
                               │
                               ▼
                         ┌──────────┐
                         │  Prisma  │
                         │    DB    │
                         └──────────┘
```

---

## 4. תוכנית עבודה - 6 שלבים

### שלב 1: בניית PaymentService (הגזע)
**קובץ:** `src/lib/payment-service.ts`

**פונקציות:**

```typescript
// 1. יצירת תשלום חדש לפגישה (או מציאת קיים)
async function createPaymentForSession(params: {
  userId: string;
  clientId: string;
  sessionId: string;
  amount: number;
  expectedAmount: number;
  method: PaymentMethod;
  paymentType: "FULL" | "PARTIAL";
  issueReceipt?: boolean;
  notes?: string;
  creditUsed?: number;
}): Promise<PaymentResult>

// 2. הוספת תשלום חלקי (תמיד יוצר child)
async function addPartialPayment(params: {
  userId: string;
  parentPaymentId: string;
  amount: number;
  method: PaymentMethod;
  issueReceipt?: boolean;
  creditUsed?: number;
}): Promise<PaymentResult>

// 3. סימון כשולם מלא
async function markFullyPaid(params: {
  userId: string;
  paymentId: string;
  method: PaymentMethod;
  issueReceipt?: boolean;
}): Promise<PaymentResult>

// 4. תשלום על כמה פגישות (bulk)
async function processMultiSessionPayment(params: {
  userId: string;
  clientId: string;
  paymentIds: string[];
  totalAmount: number;
  method: PaymentMethod;
  paymentMode: "FULL" | "PARTIAL";
  creditUsed?: number;
}): Promise<BulkPaymentResult>

// 5. הנפקת קבלה (EXEMPT או מורשה)
async function issueReceipt(params: {
  userId: string;
  paymentId: string;
  amount: number;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  description: string;
  method: PaymentMethod;
}): Promise<ReceiptResult>

// 6. שליחת מייל קבלה
async function sendPaymentReceiptEmail(params: {
  userId: string;
  paymentId: string;
  amountPaid: number;
  clientId: string;
}): Promise<void>
```

**לוגיקת ליבה ב-`createPaymentForSession`:**
```
1. בדוק אם כבר קיים payment ל-sessionId
2. אם לא קיים:
   - צור payment חדש
   - אם FULL → status: PAID, paidAt: now
   - אם PARTIAL → status: PENDING
3. אם כבר קיים:
   - צור CHILD payment עם הסכום החדש
   - עדכן parent.amount = parent.amount + newAmount
   - אם parent.amount >= parent.expectedAmount → PAID
4. טפל בקרדיט (creditUsed)
5. צור task לגביה (אם PARTIAL)
6. הנפק קבלה (אם נדרש)
7. שלח מייל (אם מוגדר)
```

**בדיקת סיום שלב 1:**
- [ ] קובץ `src/lib/payment-service.ts` קיים
- [ ] כל 6 הפונקציות מיוצאות
- [ ] אין שגיאות TypeScript
- [ ] הלוגיקה מהקוד הקיים הועתקה ואוחדה

---

### שלב 2: חיבור POST /api/payments
**קובץ:** `src/app/api/payments/route.ts`

**מה משתנה:**
- הפונקציה `POST` הופכת מ-~280 שורות ל-~30 שורות
- במקום הלוגיקה הפנימית, קוראת ל-`PaymentService.createPaymentForSession()`
- הפונקציה `GET` לא משתנה

**לפני:**
```typescript
export async function POST(request) {
  // 20 שורות: auth + validation
  // 20 שורות: credit handling
  // 20 שורות: upsert payment (הבעיה - דורס!)
  // 15 שורות: task creation
  // 80 שורות: receipt creation (כפול!)
  // 70 שורות: email sending (כפול!)
  // 10 שורות: error handling
}
```

**אחרי:**
```typescript
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  const body = await request.json();
  const result = await createPaymentForSession({
    userId: session.user.id,
    clientId: body.clientId,
    sessionId: body.sessionId,
    amount: body.amount,
    expectedAmount: body.expectedAmount,
    method: body.method,
    paymentType: body.paymentType,
    issueReceipt: body.issueReceipt,
    creditUsed: body.creditUsed,
    notes: body.notes,
  });

  if (!result.success) {
    return NextResponse.json({ message: result.error }, { status: 400 });
  }
  return NextResponse.json(result.payment, { status: 201 });
}
```

**בדיקת סיום שלב 2:**
- [ ] POST /api/payments עובד ליצירת תשלום חדש
- [ ] POST /api/payments עובד כשכבר יש תשלום (יוצר child, לא דורס!)
- [ ] קבלות נוצרות כרגיל
- [ ] מיילים נשלחים כרגיל
- [ ] אין שגיאות linter

---

### שלב 3: חיבור PUT /api/payments/[id]
**קובץ:** `src/app/api/payments/[id]/route.ts`

**מה משתנה:**
- הפונקציה `PUT` הופכת מ-~300 שורות ל-~30 שורות
- קוראת ל-`PaymentService.addPartialPayment()` או `markFullyPaid()`
- הפונקציות `GET` לא משתנות

**בדיקת סיום שלב 3:**
- [ ] PUT /api/payments/[id] עדיין יוצר child payments
- [ ] קבלות על child payments עובדות
- [ ] Mark Paid page עובד

---

### שלב 4: חיבור POST /api/payments/pay-client-debts
**קובץ:** `src/app/api/payments/pay-client-debts/route.ts`

**מה משתנה:**
- במקום לעדכן parent.amount ישירות, קוראת ל-`processMultiSessionPayment()`
- processMultiSessionPayment יוצר child payment לכל תשלום

**זה התיקון החשוב ביותר!** אחרי זה, תשלומים מהדף הכללי יופיעו כ"תשלום 3:", "תשלום 4:" וכו' בתיקיית המטופל.

**בדיקת סיום שלב 4:**
- [ ] תשלום מדף כללי יוצר child payment
- [ ] בתיקיית מטופל מופיע "תשלום 3:" אחרי תשלום מהדף הכללי
- [ ] תשלום מלא (על כל החוב) עובד
- [ ] תשלום חלקי עובד
- [ ] קרדיט עובד

---

### שלב 5: חיבור POST /api/clients/[id]/bulk-payment
**קובץ:** `src/app/api/clients/[id]/bulk-payment/route.ts`

**מה משתנה:**
- אותו שינוי כמו שלב 4

**בדיקת סיום שלב 5:**
- [ ] Bulk payment יוצר child payments
- [ ] Bulk payment עם חלקי עובד

---

### שלב 6: אימות סופי ו-deploy
- [ ] כל 5 ה-API routes עוברים דרך PaymentService
- [ ] אין קוד קבלות כפול (רק ב-PaymentService)
- [ ] אין קוד מיילים כפול (רק ב-PaymentService)
- [ ] אין שגיאות linter בכל הקבצים שנערכו
- [ ] git commit + push ל-Render

---

## 5. קבצים שצריך לערוך

| # | קובץ | שינוי | שלב |
|---|------|-------|-----|
| 1 | `src/lib/payment-service.ts` | **חדש** - הגזע | 1 |
| 2 | `src/app/api/payments/route.ts` | POST הופך לדק | 2 |
| 3 | `src/app/api/payments/[id]/route.ts` | PUT הופך לדק | 3 |
| 4 | `src/app/api/payments/pay-client-debts/route.ts` | POST הופך לדק | 4 |
| 5 | `src/app/api/clients/[id]/bulk-payment/route.ts` | POST הופך לדק | 5 |

**קבצים שלא משתנים:**
- כל ה-frontend components (9 מקומות) - קוראים לאותם API routes
- `PUT /api/sessions/[id]` - יוצר payment ראשוני בלבד, לא צריך שינוי
- Webhooks (meshulam, sumit) - מעדכנים סטטוס בלבד
- כל קבצי ה-GET (client-debts, paid-history, monthly-total, export)

---

## 6. איך לבדוק איפה הצ'אט הקודם עצר

**הריצו את הפקודה הבאה:**
```bash
# בדוק אם PaymentService קיים
ls src/lib/payment-service.ts

# בדוק כמה שורות יש בכל API route (אם קצר = כבר הוחלף)
wc -l src/app/api/payments/route.ts
wc -l src/app/api/payments/[id]/route.ts
wc -l src/app/api/payments/pay-client-debts/route.ts
wc -l src/app/api/clients/[id]/bulk-payment/route.ts
```

**טבלת מצב:**

| שלב | איך יודעים שהושלם |
|-----|-------------------|
| 1 | הקובץ `src/lib/payment-service.ts` קיים ומכיל 6 פונקציות |
| 2 | `src/app/api/payments/route.ts` - POST הוא ~30 שורות (במקום ~280) |
| 3 | `src/app/api/payments/[id]/route.ts` - PUT הוא ~30 שורות (במקום ~300) |
| 4 | `src/app/api/payments/pay-client-debts/route.ts` - POST הוא ~30 שורות (במקום ~300) |
| 5 | `src/app/api/clients/[id]/bulk-payment/route.ts` - POST הוא ~30 שורות (במקום ~130) |
| 6 | git log מראה commit עם "PaymentService" |

**אם צ'אט חדש צריך להמשיך:**
1. קרא את הקובץ הזה (`PAYMENT-SERVICE-PLAN.md`)
2. בדוק את טבלת המצב למעלה
3. המשך מהשלב הבא שלא הושלם
4. אל תשנה את ה-frontend - רק את ה-API routes

---

## 7. כללי בטיחות

1. **אל תשנה את ה-Prisma schema** - המודל Payment כבר תומך ב-parent/child
2. **אל תשנה שום קומפוננטת frontend** - הם קוראים ל-API routes שלא משתנים
3. **אל תשנה את ה-GET routes** - רק POST/PUT שיוצרים/מעדכנים
4. **אל תשנה webhooks** - הם רק מעדכנים סטטוס
5. **תבדוק linter אחרי כל שלב**
6. **תעשה commit אחרי כל שלב שעובד**

---

## 8. הלוגיקה הקיימת שצריך לשמר

### קבלות (EXEMPT - עוסק פטור)
```typescript
const receiptUser = await prisma.user.update({
  where: { id: userId },
  data: { nextReceiptNumber: { increment: 1 } },
  select: { nextReceiptNumber: true },
});
const reservedNumber = (receiptUser.nextReceiptNumber ?? 2) - 1;
const year = new Date().getFullYear();
receiptNumber = `${year}-${String(reservedNumber).padStart(4, "0")}`;
receiptUrl = getReceiptPageUrl(paymentId);
```

### קבלות (מורשה - דרך ספק חיוב)
```typescript
const billingService = createBillingService(userId);
const receiptResult = await billingService.createReceipt({
  clientName, clientEmail, clientPhone,
  amount, description, paymentMethod,
  sendEmail: false,
});
```

### שליחת מייל
```typescript
const { subject, html } = createPaymentReceiptEmail({...});
if (sendReceiptToClient) await sendEmail({ to: clientEmail, subject, html });
if (sendReceiptToTherapist) await sendEmail({ to: therapistEmail, subject: `[עותק] ${subject}`, html });
```

### Child Payment (הדפוס הנכון מ-PUT /api/payments/[id])
```typescript
const childPayment = await prisma.payment.create({
  data: {
    parentPaymentId: parentId,
    clientId: existingPayment.clientId,
    amount: newAmount,
    expectedAmount: newAmount,
    method: method,
    status: "PAID",
    paidAt: new Date(),
    paymentType: "PARTIAL",
  },
});
// עדכון parent
finalAmount = existingAmount + newAmount;
finalStatus = finalAmount >= expectedAmount ? "PAID" : "PENDING";
await prisma.payment.update({
  where: { id: parentId },
  data: { amount: finalAmount, status: finalStatus },
});
```

### Credit (ניכוי קרדיט)
```typescript
if (creditUsed > 0) {
  if (Number(client.creditBalance) >= creditUsed) {
    await prisma.client.update({
      where: { id: clientId },
      data: { creditBalance: { decrement: creditUsed } },
    });
  } else {
    throw new Error("אין מספיק קרדיט");
  }
}
```

---

## 9. Imports שה-PaymentService צריך

```typescript
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { createPaymentReceiptEmail } from "@/lib/email-templates/payment-receipt";
import { createBillingService } from "@/lib/billing";
import { getReceiptPageUrl } from "@/lib/receipt-token";
import { mapPaymentMethod } from "@/lib/email-utils";
```

---

## 10. ה-endpoint `/api/sessions/[id]/status` (PATCH)

**חשוב:** קיים endpoint `PATCH /api/sessions/[id]/status` בקובץ:
`src/app/api/sessions/[id]/status/route.ts`

הוא מטפל ב:
- בדיקת מעברי סטטוס חוקיים (VALID_TRANSITIONS)
- שמירת cancelledAt, cancelledBy, cancellationReason
- שליחת אימיילים לאישור/דחייה של PENDING_APPROVAL
- ניקוי התראות

**אל תשנה אותו!** הוא לא קשור לתשלומים, רק לסטטוס פגישות.
