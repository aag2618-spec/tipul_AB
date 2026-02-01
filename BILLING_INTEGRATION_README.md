# 🧾💳 מערכת חיוב וקבלות - הוראות הטמעה

## 📋 **מה הוספנו?**

מערכת מקיפה שמאפשרת לכל מטפל לחבר את ספקי החיוב שלו **בעצמו** - ללא צורך בהתערבות שלך!

---

## 🗄️ **שינויים בדאטהבייס**

### **1️⃣ מודל חדש: `BillingProvider`**
מאחסן את פרטי החיבור (מוצפנים!) של כל מטפל לספקי חיוב.

### **2️⃣ עדכון: `CommunicationSetting`**
שדות חדשים:
- `sendReceiptToClient` - שלח קבלה למטופל
- `sendReceiptToTherapist` - שלח עותק למטפל
- `receiptEmailTemplate` - תבנית מותאמת אישית

---

## 🚀 **הפעלת ה-Migration**

### **אופציה A: דרך Prisma (מומלץ)**
```bash
# בסביבת הפיתוח:
npx prisma migrate dev --name add_billing_providers

# בייצור (Render):
npx prisma migrate deploy
```

### **אופציה B: SQL ידני**
```bash
# התחבר ל-Database:
psql $DATABASE_URL

# הרץ את הקובץ:
\i prisma/migrations/add_billing_providers.sql
```

---

## 🔐 **הגדרת משתנה סביבה (קריטי!)**

צריך להוסיף מפתח הצפנה ב-`.env`:

```bash
# .env או .env.local
ENCRYPTION_KEY="your-32-character-secret-key-here-change-this!!"
```

**⚠️ חשוב מאוד:**
- המפתח חייב להיות **32 תווים בדיוק**
- **אל תשתף** את המפתח הזה!
- ב-Production (Render) - הוסף את זה ב-Environment Variables

### **יצירת מפתח אקראי:**
```bash
# PowerShell:
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})

# או בNode:
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

---

## 🎨 **ממשק המשתמש**

### **מה המטפל רואה:**

#### **`/dashboard/settings/integrations`**
```
┌─────────────────────────────────────┐
│  💳 Meshulam                        │
│  סליקת אשראי + קבלות               │
│                                     │
│  • 💳 סליקת אשראי                  │
│  • 🧾 קבלות אוטומטיות              │
│  • 🔗 תשלום בקישור                 │
│                                     │
│  [התחבר] ← לוחץ כאן                │
└─────────────────────────────────────┘

↓ נפתח חלון:

┌─────────────────────────────────────┐
│  חיבור Meshulam                     │
│                                     │
│  API Key *                          │
│  [•••••••••••] 👁️                  │
│                                     │
│  📖 איך למצוא?                     │
│  1. היכנס ל-Meshulam                │
│  2. הגדרות → API                    │
│  3. העתק "Page Code"                │
│  4. הדבק כאן                        │
│                                     │
│  [ביטול]  [שמור וחבר]              │
└─────────────────────────────────────┘
```

#### **`/dashboard/settings/communication`**
```
┌─────────────────────────────────────┐
│  📧 קבלות ותשלומים                 │
│                                     │
│  ☑️ שלח קבלה אוטומטית              │
│                                     │
│  למי לשלוח:                        │
│  ☑️ למטופל (למייל שלו)             │
│  ☐ למטפל (עותק למייל שלי)          │
│                                     │
│  תבנית מייל:                       │
│  ┌─────────────────────────────┐  │
│  │ תודה רבה על התשלום!          │  │
│  │ מצורפת קבלה על סך {סכום}    │  │
│  │                              │  │
│  │ בברכה,                       │  │
│  │ {שם_מטפל}                   │  │
│  └─────────────────────────────┘  │
│                                     │
│  [שמור הגדרות]                     │
└─────────────────────────────────────┘
```

---

## 🔧 **הספקים הנתמכים**

### **סליקה + קבלות:**
- ✅ **Meshulam** - הפופולרי ביותר
- ✅ **Sumit** - Developer friendly

### **קבלות בלבד:**
- ✅ **iCount** - חינמי עד 25/חודש
- ✅ **Green Invoice** - ממשק יפה

### **סליקה בלבד:**
- ✅ **PayPlus** - מודרני
- ✅ **CardCom** - ותיק
- ✅ **Tranzila** - פופולרי

---

## 🔄 **Flow מלא**

### **חיבור ספק:**
```
1. מטפל נכנס להגדרות
2. לוחץ "התחבר" על Meshulam
3. מזין API Key
4. המערכת מצפינה ושומרת
5. מעכשיו הספק מחובר!
```

### **יצירת תשלום:**
```
1. מטפל מסמן "התקבל תשלום - ₪350 מזומן"
2. המערכת בודקת: האם מחובר לספק קבלות?
3. אם כן:
   a. יוצרת קבלה ב-Meshulam (דרך API)
   b. שולחת מייל למטופל עם קישור לקבלה
   c. שולחת עותק למטפל (אם מופעל)
4. אם לא:
   a. רק מעדכנת במערכת
   b. שולחת מייל אישור (בלי קבלה רשמית)
```

### **תשלום בקישור (אשראי):**
```
1. מטפל שולח קישור תשלום למטופל
2. מטופל משלם ב-Meshulam
3. Meshulam שולח Webhook ←
4. המערכת מעדכנת: "שולם!"
5. שולחת מייל למטופל: "תודה! מצורפת קבלה"
6. שולחת עותק למטפל: "התקבל תשלום מדני - ₪350"
```

---

## 🔒 **אבטחה**

### **הצפנת API Keys:**
- ✅ שימוש ב-AES-256-GCM
- ✅ IV רנדומלי לכל הצפנה
- ✅ Auth Tag לאימות
- ✅ המפתח נשמר ב-ENV

### **אימות Webhooks:**
```typescript
// בדיקת signature מהספק
const isValid = verifyWebhookSignature(
  request.body,
  request.headers.signature,
  webhookSecret
);

if (!isValid) {
  return Response.json({ error: "Invalid signature" }, { status: 401 });
}
```

---

## 📝 **TODO הבא:**

### **שלב 1: Migration** ✅ (מוכן!)
```bash
npx prisma migrate dev --name add_billing_providers
```

### **שלב 2: סנכרון Prisma Client**
```bash
npx prisma generate
```

### **שלב 3: הוספת ENCRYPTION_KEY**
```bash
# ב-Render:
Dashboard → Environment → Add:
ENCRYPTION_KEY=your-32-char-key-here
```

### **שלב 4: Deploy**
```bash
git add .
git commit -m "Add billing providers integration system"
git push
```

### **שלב 5: הרץ Migration בייצור**
```bash
# Render יריץ אוטומטית, או דרך Shell:
npx prisma migrate deploy
```

---

## 🧪 **בדיקה:**

### **1. בדוק שהדף עובד:**
```
https://tipul-mh2t.onrender.com/dashboard/settings/integrations
```

### **2. נסה לחבר Meshulam (Sandbox):**
```
API Key: test_abc123
```

### **3. בדוק שהמידע נשמר מוצפן:**
```sql
SELECT id, provider, LEFT(apiKey, 50) as encrypted_preview 
FROM "BillingProvider" 
LIMIT 5;
```

אם רואה משהו כמו: `a1b2c3d4e5f6:1234abcd:...` - **זה מוצפן!** ✅

---

## 🎓 **למפתחים:**

### **שימוש ב-API Key:**
```typescript
import { decrypt } from '@/lib/encryption';

// שליפה והצפנה
const provider = await prisma.billingProvider.findFirst({
  where: { userId: therapistId, provider: 'MESHULAM' }
});

const apiKey = decrypt(provider.apiKey);

// שימוש
const meshulam = new MeshulamClient(apiKey);
await meshulam.createInvoice({ ... });
```

---

## 📅 **עדכון**
**תאריך:** 28 ינואר 2026  
**גרסה:** 1.0  
**סטטוס:** מוכן להטמעה! 🚀
