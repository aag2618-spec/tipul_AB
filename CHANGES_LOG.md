# סיכום שינויים מלא - Tipul AB
## תאריך: 10 בפברואר 2026

---

## א. קבצים חדשים שנוצרו

### 1. `src/lib/pricing.ts` - מקור אמת מרכזי לתמחור
- כל המחירים מוגדרים כאן בלבד (ESSENTIAL / PRO / ENTERPRISE)
- תקופות: חודשי (1), רבעוני (3), חצי שנתי (6), שנתי (12)
- פונקציות: getDiscount, getAverageMonthlyPrice, detectPeriodFromAmount
- detectPeriodFromAmount - מזהה תקופה לפי סכום (עם סטייה של ₪5)

### 2. `src/lib/rate-limit.ts` - Rate Limiter בזיכרון
- In-memory store - מתאים לשרת יחיד (Render)
- ניקוי אוטומטי כל 5 דקות
- הגדרות מוכנות: API_RATE_LIMIT, AUTH_RATE_LIMIT, SUBSCRIPTION_RATE_LIMIT, WEBHOOK_RATE_LIMIT
- פונקציית rateLimitResponse עם headers מתאימים

### 3. `src/lib/billing-logger.ts` - לוג קריאות לספקי חיוב
- שומר לטבלת ApiUsageLog
- withBillingLog - wrapper שמודד זמן אוטומטית

### 4. `src/lib/webhook-retry.ts` - ניסיון חוזר ל-webhooks
- שומר webhooks שנכשלו בטבלת AdminAlert (סוג SYSTEM)
- withWebhookRetry - wrapper שתופס שגיאות

### 5. `src/app/api/admin/subscribers/route.ts` - API חיפוש מנויים
- חיפוש לפי שם (חלקי), מייל, טלפון
- סינון לפי סטטוס ומסלול
- Pagination
- מחזיר: פרטי משתמש + תשלומים אחרונים + אישורי תנאים + סטטיסטיקות

### 6. `src/app/api/admin/terms/route.ts` - API אישורי תנאים
- GET בלבד (אין DELETE/PUT - רשומות אלו הוכחה חוקית!)
- סינון לפי userId
- Pagination

---

## ב. קבצים שעודכנו

### 7. `prisma/schema.prisma`
**שינויים:**
- שדות חדשים ב-User: `isFreeSubscription` (Boolean), `freeSubscriptionNote` (String?), `freeSubscriptionGrantedAt` (DateTime?)
- מודל חדש: `TermsAcceptance` - הוכחה חוקית על אישור תנאים
  - שדות: userId, userEmail, userName, termsVersion, termsType, acceptedContent, action, planSelected, billingMonths, amountAgreed, ipAddress, userAgent
  - אינדקסים: userId, createdAt, termsType
- Relation חדש: `termsAcceptances TermsAcceptance[]` ב-User

### 8. `src/lib/auth.ts`
**שינויים:**
- CANCELLED + subscriptionEndsAt בעתיד → token.subscriptionStatus = "ACTIVE" (המנוי ממשיך עד סוף תקופה ששולמה)
- PAUSED → token.subscriptionStatus = "PAST_DUE" (גישה עם אזהרה)
- Grace period: 7 ימים אחרי פקיעת מנוי לפני חסימה מלאה

### 9. `src/app/api/webhooks/meshulam/route.ts`
**שינויים:**
- `handlePaymentSuccess`: תוקן מ-30 ימים hardcoded → `detectPeriodCentral` (מזהה תקופה לפי סכום)
- `handleSubscriptionCreated`: תוקן מ-30 ימים hardcoded → `detectPeriodCentral`
- `handleSubscriptionRenewed`: כבר השתמש ב-detectPeriodCentral
- שילוב ניקוי שדות חינם (`isFreeSubscription: false`) אחרי תשלום
- שילוב `withWebhookRetry` + `checkRateLimit`
- שימוש ב-`PLAN_NAMES` מ-pricing.ts (במקום הגדרה מקומית)

### 10. `src/app/api/subscription/create/route.ts`
**שינויים:**
- בדיקת `termsAccepted` בצד שרת (מחזיר 400 אם חסר)
- יצירת TermsAcceptance עם IP, user-agent, גרסת תנאים
- תמחור מ-pricing.ts (PRICING, PERIOD_DAYS, PERIOD_LABELS)
- Rate limiting (SUBSCRIPTION_RATE_LIMIT)

### 11. `src/app/api/subscription/cancel/route.ts`
**שינויים:**
- חישוב התאמת הנחה לביטול מוקדם (calculateFairPrice, calculateCancellationAdjustment)
- יצירת SubscriptionPayment עם סטטוס PENDING אם יש הפרש
- מיילים למנוי ולאדמין עם פירוט
- Rate limiting
- תמחור מ-pricing.ts

### 12. `src/app/api/subscription/status/route.ts`
**שינויים:**
- isActive מחושב נכון: ACTIVE, TRIALING בתוקף, CANCELLED עם תאריך עתידי
- מחיר חודשי מ-MONTHLY_PRICES (pricing.ts)

### 13. `src/app/api/admin/users/[id]/route.ts` (PATCH)
**שינויים:**
- `grantFree`: מפעיל מנוי חינם + שולח מייל הפעלה
- `revokeFree`: מבטל חינם + קובע 7 ימים grace + שולח מייל עם קישור לתשלום
- `extendDays`: הארכת מנוי מתאריך קיים או מהיום
- Import: sendEmail, PLAN_NAMES

### 14. `src/app/api/cron/subscription-reminders/route.ts`
**שינויים:**
- כל השאילתות כוללות `subscriptionStatus: { in: ["ACTIVE", "CANCELLED"] }`
- סעיף 5 (חסימה אחרי grace) - גם CANCELLED
- תמחור מ-MONTHLY_PRICES (pricing.ts)

### 15. `src/app/api/cron/generate-alerts/route.ts`
**שינויים:**
- expiringUsers: כולל `subscriptionStatus: { in: ["ACTIVE", "CANCELLED"] }`
- expiredUsers: כולל `subscriptionStatus: { in: ["ACTIVE", "CANCELLED"] }`

### 16. `src/app/(dashboard)/dashboard/settings/billing/page.tsx`
**שינויים:**
- תקופות חיוב: 1, 3, 6, 12 חודשים עם הנחות מחושבות
- תנאי שימוש: Checkbox חובה + פירוט תנאים + חסימת כפתורי רכישה
- חישוב ביטול מוקדם (calculateFairPrice) - client side
- דיאלוג ביטול עם פירוט התאמת הנחה
- ניווט עקבי (פרופיל, התראות, תקשורת, אינטגרציות, מנוי)

### 17. `src/app/(dashboard)/dashboard/settings/integrations/page.tsx`
**שינויים:**
- כפתור "בדוק חיבור" לספקי חיוב מחוברים
- הוראות ספציפיות ל-SUMIT
- Import: CheckCircle

### 18. `src/app/admin/billing/page.tsx` (שכתוב מלא)
**שינויים:**
- דף ניהול מנויים מקיף: טבלה + חיפוש + סינון + pagination
- סטטיסטיקות מהירות (6 כרטיסים)
- שורה מורחבת (תשלומים + תנאים)
- דיאלוג פרטים מלאים (3 טאבים)
- דיאלוגי פעולות: חסימה, שדרוג, הארכה, מנוי חינם, ביטול חינם
- תגית "חינם" כתומה בטבלה
- Fragment עם key (תוקן מ-React warning)
- handleSearch ללא double-fetch

### 19. `src/components/admin-sidebar.tsx`
**שינויים:**
- הוספת "אישורי תנאים" (/admin/terms) עם אייקון FileCheck

---

## ג. באגים שמצאתי ותיקנתי

| חומרה | באג | קובץ | פירוט |
|---|---|---|---|
| קריטי | handlePaymentSuccess תמיד 30 יום | webhooks/meshulam | מנוי שנתי קיבל רק חודש. תוקן עם detectPeriodCentral |
| קריטי | handleSubscriptionCreated תמיד 30 יום | webhooks/meshulam | מנוי חדש שנתי קיבל רק חודש. תוקן |
| קריטי | revokeFree השאיר גישה חינם לחודשים | admin/users/[id] | ביטול חינם לא שינה subscriptionEndsAt - המשתמש נשאר עם גישה עד 10 שנים. תוקן ל-7 ימים grace |
| בינוני | Fragment בלי key ב-.map() | admin/billing | React warning + באגים בעדכון טבלה. תוקן |
| בינוני | handleSearch double-fetch | admin/billing | קריאת API כפולה עם page ישן. תוקן |
| קל | Cron סעיף 5 לא חסם CANCELLED | subscription-reminders | מנויים CANCELLED שעברו grace לא נחסמו. תוקן |
| קל | Dead import Download | admin/billing | הוסר |

---

## ד. מה צריך להשלים ידנית

### 1. הרצת Prisma Migration (חובה!)
```bash
npx prisma migrate dev --name add-terms-and-free-subscription
```
זה יוסיף את:
- שדות isFreeSubscription, freeSubscriptionNote, freeSubscriptionGrantedAt לטבלת User
- טבלת TermsAcceptance החדשה

### 2. משתני סביבה (Environment Variables) ב-Render
ודא שהמשתנים הבאים קיימים:
- `DATABASE_URL` - כתובת PostgreSQL
- `NEXTAUTH_URL` - כתובת האתר (https://your-app.onrender.com)
- `NEXTAUTH_SECRET` - מפתח סודי
- `MESHULAM_API_KEY` - מפתח API של Meshulam
- `MESHULAM_WEBHOOK_SECRET` - סוד Webhook (אם יש)
- `ADMIN_EMAIL` - המייל שלך לקבלת התראות
- `CRON_SECRET` - סוד ל-cron jobs
- `RESEND_API_KEY` - מפתח API של Resend לשליחת מיילים
- `ENCRYPTION_KEY` - מפתח הצפנה AES-256

### 3. הגדרת Cron Jobs (חובה!)
ב-Render או בשירות חיצוני (cron-job.org, easycron.com), הגדר:

**תזכורות מנוי - כל יום בשעה 09:00:**
```
GET https://your-app.onrender.com/api/cron/subscription-reminders
Header: Authorization: Bearer YOUR_CRON_SECRET
```

**יצירת התראות אדמין - כל יום בשעה 08:00:**
```
GET https://your-app.onrender.com/api/cron/generate-alerts
Header: Authorization: Bearer YOUR_CRON_SECRET
```

### 4. הגדרת Webhook ב-Meshulam
בפאנל הניהול של Meshulam, הגדר:
- Webhook URL: `https://your-app.onrender.com/api/webhooks/meshulam`
- Events: payment.success, payment.failed, subscription.created, subscription.renewed, subscription.cancelled

### 5. הגדרת Resend (שליחת מיילים)
- היכנס ל-resend.com
- הגדר דומיין שליחה (או השתמש בדומיין ברירת מחדל)
- צור API Key והכנס ל-RESEND_API_KEY

---

## ה. מה להוסיף בהמשך (לא קריטי עכשיו)

### 1. סנכרון תמחור
המחירים מוגדרים בשני מקומות:
- `src/lib/pricing.ts` (מקור אמת - לצד שרת)
- `src/app/(dashboard)/dashboard/settings/billing/page.tsx` (צד לקוח)

בהמשך כדאי שדף ה-billing ייבא מ-pricing.ts (דורש API route או server component).

### 2. דף admin/terms
הדף `/admin/terms/page.tsx` (UI) נוצר אבל הוא בסיסי. בהמשך אפשר להוסיף:
- חיפוש לפי שם/מייל (לא רק userId)
- ייצוא ל-CSV
- תצוגה מפורטת של כל רשומה

### 3. Webhook ל-Sumit
אם תשתמש גם ב-Sumit (לא רק Meshulam), צריך webhook handler דומה ב:
`src/app/api/webhooks/sumit/route.ts`

### 4. ביטול הוראת קבע ב-Meshulam
כשמשתמש מבטל מנוי, צריך גם לבטל את הוראת הקבע ב-Meshulam דרך ה-API שלהם.
כרגע רק הסטטוס ב-DB משתנה אבל ההוראה ב-Meshulam עדיין פעילה.

### 5. חיוב התאמת הנחה
כשמשתמש מבטל מנוי מוזל מוקדם, נוצרת רשומת תשלום PENDING עם ההפרש.
צריך לממש את החיוב בפועל דרך Meshulam API (חיוב ידני של כרטיס אשראי).

---

## ו. לגבי "הכפתור שהורד"
**לא הורד שום כפתור מהמסך!** הוסרה רק שורת `import` של אייקון `Download` מ-lucide-react שהיה מיובא אבל **מעולם לא הוצג על המסך**. אף אלמנט ויזואלי לא נפגע.

---

## ז. זרימות מערכת חשובות

### זרימת מנוי חינם (חדש)
```
אדמין לוחץ "מנוי חינם" בטבלה
→ בוחר מסלול + תקופה + הערה
→ API מעדכן User (isFreeSubscription=true, subscriptionStatus=ACTIVE)
→ מייל נשלח למנוי
```

### זרימת ביטול חינם (חדש)
```
אדמין לוחץ כפתור Gift אדום
→ אישור בדיאלוג
→ API: isFreeSubscription=false, subscriptionStatus=CANCELLED, subscriptionEndsAt=+7 ימים
→ מייל עם קישור לתשלום נשלח למנוי
→ (המנוי עדיין פעיל 7 ימים - כי CANCELLED + תאריך עתידי = ACTIVE ב-auth.ts)
→ המנוי משלם → webhook → ACTIVE + isFreeSubscription=false
```

### זרימת ביטול מנוי רגיל
```
משתמש לוחץ "ביטול מנוי" בדף billing
→ חישוב התאמת הנחה (אם מנוי מוזל)
→ API: subscriptionStatus=CANCELLED (subscriptionEndsAt נשאר)
→ auth.ts: CANCELLED + עתיד = ACTIVE (גישה עד סוף תקופה)
→ מיילים למנוי + אדמין
→ אחרי subscriptionEndsAt: auth.ts → PAST_DUE (grace 7 ימים)
→ אחרי grace: CANCELLED (חסום)
```
