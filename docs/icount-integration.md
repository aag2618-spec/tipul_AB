# חיבור iCount - תיעוד טכני מלא

## סקירה כללית

iCount הוא ספק חיוב חיצוני להנפקת קבלות עבור עוסקים מורשים/חברות.
החיבור מאפשר הנפקה אוטומטית של קבלות, חשבוניות מס, וחשבוניות מס-קבלה ישירות מהמערכת.

---

## ארכיטקטורה - מבנה הקבצים

```
src/
├── lib/
│   ├── icount/
│   │   ├── types.ts          # טיפוסים ל-API של iCount
│   │   ├── client.ts         # Client ראשי - קריאות API
│   │   └── index.ts          # ייצוא מרכזי
│   ├── billing/
│   │   └── service.ts        # BillingService - שכבת הפשטה מעל כל הספקים
│   ├── billing-logger.ts     # לוגים של קריאות API
│   └── payments/
│       └── receipt-service.ts # שירות הנפקת קבלות
├── app/api/integrations/billing/
│   ├── route.ts              # GET/POST - ניהול ספקי חיוב
│   ├── test/route.ts         # POST - בדיקת חיבור
│   └── [id]/route.ts         # DELETE/PATCH - מחיקה/עדכון ספק
├── components/settings/
│   └── connections-tab.tsx    # UI - הגדרת חיבור iCount
└── lib/
    └── export-utils.ts       # זיהוי מקור קבלה + ייצוא לרו"ח
```

---

## Prisma Schema

### BillingProviderType (enum)
```prisma
enum BillingProviderType {
  MESHULAM        // סליקה + קבלות
  ICOUNT          // קבלות בלבד
  GREEN_INVOICE   // קבלות בלבד
  SUMIT           // קבלות + סליקה
  PAYPLUS         // סליקה בלבד
  CARDCOM         // סליקה בלבד
  TRANZILA        // סליקה בלבד
}
```

### BillingProvider (model)
```prisma
model BillingProvider {
  id            String              @id @default(cuid())
  userId        String
  provider      BillingProviderType
  displayName   String
  apiKey        String              @db.Text  // מוצפן - Company ID
  apiSecret     String?             @db.Text  // מוצפן - username|||password
  webhookSecret String?             @db.Text
  isActive      Boolean             @default(true)
  isPrimary     Boolean             @default(false)
  settings      Json?               // ICountSettings
  lastSyncAt    DateTime?
  lastError     String?             @db.Text
  createdAt     DateTime            @default(now())
  updatedAt     DateTime?
  user          User                @relation(...)
}
```

### Payment (שדות רלוונטיים)
```prisma
model Payment {
  receiptNumber String?     // מספר קבלה מ-iCount
  receiptUrl    String?     // URL לצפייה/הורדה
  hasReceipt    Boolean @default(false)
}
```

---

## טיפוסים (Types) - `src/lib/icount/types.ts`

| טיפוס | תיאור |
|--------|--------|
| `ICountResponse<T>` | תגובה בסיסית מה-API |
| `ICountCustomer` | פרטי לקוח (שם, אימייל, טלפון, כתובת, מספר עוסק) |
| `ICountDocumentItem` | פריט במסמך (תיאור, כמות, מחיר יחידה) |
| `ICountDocumentType` | סוגי מסמכים: receipt, tax_invoice, invoice_receipt, credit_note, quote |
| `CreateDocumentRequest` | בקשה ליצירת מסמך |
| `CreateDocumentResponse` | תגובה מנורמלת: id, number, url, pdfUrl, amount |
| `ICountRawDocResponse` | תגובה גולמית מה-API (שדות משתנים) |
| `ICountSettings` | הגדרות: companyId, vatExempt, defaultLanguage, autoSendEmail |

---

## ICountClient - `src/lib/icount/client.ts`

### Constructor
```typescript
new ICountClient(companyId: string, credentials: string, settings?: ICountSettings)
// credentials בפורמט: "username|||password"
```

### שיטות ציבוריות

| שיטה | תיאור |
|-------|--------|
| `testConnection()` | בדיקת תקינות חיבור - מתחבר ומחזיר true/false |
| `getAvailableDocTypes()` | קבלת סוגי מסמכים זמינים מ-iCount |
| `createReceipt(request)` | יצירת קבלה - מנסה סוגים שונים עד הצלחה |
| `createInvoice(request)` | יצירת חשבונית מס (קוד 305) |
| `createInvoiceReceipt(request)` | יצירת חשבונית מס-קבלה (קוד 320) |
| `getDocumentUrl(docId)` | קבלת URL של מסמך קיים |

### שיטות פרטיות

| שיטה | תיאור |
|-------|--------|
| `login()` | התחברות ל-API (POST ל-`auth/login`) - מחזיר SID |
| `request<T>()` | בקשה כללית עם ניהול SID (session ID) |
| `buildDocumentData()` | בניית נתוני מסמך בפורמט JSON |
| `mapDocType()` | המרת סוג מסמך לקוד: receipt=400, tax_invoice=305, invoice_receipt=320 |
| `mapPaymentType()` | המרת תשלום: cash=1, check=2, bank_transfer=3, credit_card=4 |
| `normalizeDocResponse()` | נרמול תגובה (התמודדות עם שדות משתנים) |

### Factory Function
```typescript
createICountClient(companyId: string, credentials: string, settings?: ICountSettings): ICountClient
```

---

## זרימת עבודה מלאה

### 1. הגדרת חיבור (חד-פעמי)

```
משתמש → ConnectionsTab UI
  → מזין: Company ID + אימייל (שם משתמש) + סיסמה
  → POST /api/integrations/billing
    → הצפנת apiKey ו-apiSecret
    → שמירה ב-BillingProvider (provider: ICOUNT)
```

### 2. בדיקת חיבור

```
משתמש → לחיצה "בדוק חיבור"
  → POST /api/integrations/billing/test
    → ICountClient.testConnection()
      → login() → קבלת SID
      → אם הצליח: עדכון lastSyncAt
      → אם נכשל: שמירת lastError
    → logBillingApiCall() → שמירה ב-ApiUsageLog
```

### 3. הנפקת קבלה אוטומטית (בעת תשלום)

```
תשלום מתקבל
  → receipt-service.ts: issueReceipt()
    → בדיקת businessType === "LICENSED"
    → BillingService.createReceipt()
      → BillingService.getPrimaryProvider()
        → שליפת ספק פעיל ראשי (ICOUNT)
      → ICountClient.createReceipt(request)
        → login() → SID
        → buildDocumentData()
        → mapDocType() → קוד 400 (קבלה)
        → POST ל-iCount API
        → normalizeDocResponse()
    → עדכון Payment:
        → receiptNumber = response.number
        → receiptUrl = response.url
        → hasReceipt = true
```

### 4. צפייה בקבלות

```
דף Receipts → רשימת תשלומים עם hasReceipt=true
  → Badge "iCount" אם receiptUrl.includes("icount")
  → קישור לצפייה/הורדת PDF
```

### 5. ייצוא דוח לרו"ח

```
דף Receipts → "ייצוא לרו"ח"
  → exportAccountantReport()
    → getReceiptSource(url) → "iCount" / "Green Invoice" / "מערכת"
    → Excel עם sheets: סיכום, פירוט, חודשי, רבעוני, לפי אמצעי תשלום
    → כולל קישורים ישירים לקבלות ב-iCount
```

---

## API Routes

### GET /api/integrations/billing
קבלת כל ספקי החיוב של המשתמש (כולל iCount).

### POST /api/integrations/billing
הוספה/עדכון ספק חיוב.
```json
{
  "provider": "ICOUNT",
  "apiKey": "company-id",
  "apiSecret": "email|||password",
  "displayName": "iCount"
}
```

### POST /api/integrations/billing/test
בדיקת חיבור לספק.
```json
{ "providerId": "clxxxx..." }
```

### DELETE /api/integrations/billing/[id]
מחיקת ספק חיוב.

### PATCH /api/integrations/billing/[id]
עדכון הגדרות (isActive, isPrimary, settings).

---

## UI - ConnectionsTab

שדות חיבור iCount:
- **Company ID** (apiKey) - מזהה חברה ב-iCount
- **אימייל** (חלק ראשון של apiSecret) - שם משתמש
- **סיסמה** (חלק שני של apiSecret) - שדה password
- פורמט שמירה: `apiSecret = "email|||password"`

---

## אבטחה

- **הצפנה**: apiKey ו-apiSecret מוצפנים לפני שמירה ב-DB
- **Session ID**: SID מ-iCount נשמר בזיכרון בלבד (לא ב-DB)
- **אין env variables**: הכל מאוחסן מוצפן בטבלת BillingProvider
- **לוגים**: כל קריאת API מתועדת ב-ApiUsageLog

---

## מיפוי קודי מסמכים ב-iCount

| סוג | קוד | שם בעברית |
|-----|------|-----------|
| receipt | 400 | קבלה |
| tax_invoice | 305 | חשבונית מס |
| invoice_receipt | 320 | חשבונית מס-קבלה |
| credit_note | 330 | חשבונית זיכוי |
| quote | 10 | הצעת מחיר |

## מיפוי אמצעי תשלום

| סוג | קוד |
|-----|------|
| cash | 1 |
| check | 2 |
| bank_transfer | 3 |
| credit_card | 4 |
