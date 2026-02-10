# מדריך הגדרה מלא מאפס + סיכום שינויים - Tipul AB
## תאריך: 10 בפברואר 2026 | גרסה 2.0

---

# חלק א: מדריך הגדרה מאפס - שלב אחרי שלב

---

## שלב 1: הרשמה ל-Resend (שירות שליחת מיילים)

**מה זה?** Resend שולח מיילים בשם המערכת: תזכורות מנוי, אישורי תשלום, התראות ביטול.

### 1.1 - הרשמה
1. גלוש ל-**[resend.com/signup](https://resend.com/signup)**
2. הירשם עם המייל שלך (או Google/GitHub)
3. אשר את כתובת המייל

### 1.2 - יצירת API Key
1. אחרי ההרשמה, היכנס ל-Dashboard
2. בתפריט לחץ **API Keys**
3. לחץ **Create API Key**
4. תן שם: `tipul-production`
5. Permission: **Full Access**
6. לחץ **Create**
7. **העתק את המפתח (מתחיל ב-`re_`) ושמור!** מוצג רק פעם אחת

### 1.3 - הגדרת דומיין (אופציונלי אבל מומלץ)
1. בתפריט לחץ **Domains**
2. לחץ **Add Domain**
3. הכנס את הדומיין שלך (למשל: `yourdomain.co.il`)
4. Resend ייתן רשומות DNS להוסיף אצל ספק הדומיין שלך
5. המתן לאימות (כמה דקות עד שעה)

> **טיפ:** בלי דומיין מאומת אפשר לשלוח רק מ-`onboarding@resend.dev` ורק למיילים שאימתת. מספיק לבדיקות, אבל לייצור חייבים דומיין מאומת.

### 1.4 - מחירים
- **חינם:** עד 100 מיילים ליום / 3,000 לחודש
- **Pro ($20/חודש):** עד 50,000 מיילים לחודש

> **שמור!** `RESEND_API_KEY` = re_________________

---

## שלב 2: הרשמה ל-Meshulam (סליקת תשלומים)

**מה זה?** Meshulam (משולם) הוא ספק סליקה ישראלי. דרכו המנויים שלך ישלמו.

### 2.1 - הרשמה
1. גלוש ל-**[meshulam.co.il](https://www.meshulam.co.il)**
2. לחץ **"הרשמה"** או **"התחל עכשיו"**
3. מלא פרטים: שם מלא, טלפון, מייל, שם עסק, ח.פ / מספר עוסק

### 2.2 - מה קורה אחרי ההרשמה?
- Meshulam יצרו קשר תוך **1-3 ימי עסקים**
- תצטרך לספק: תעודת זהות, אישור ניהול חשבון, תעודת עוסק
- אחרי אישור תקבל גישה לפאנל

### 2.3 - קבלת API Key (אחרי אישור)
1. היכנס לפאנל Meshulam
2. לך ל-**הגדרות** ← **API**
3. העתק את ה-**Page Code** (זה ה-API Key)

### 2.4 - יצירת קשר ישיר

| פרט | מידע |
|------|------|
| אתר | [meshulam.co.il](https://www.meshulam.co.il) |
| טלפון | 073-2756200 |
| מייל | info@meshulam.co.il |
| שעות פעילות | א'-ה' 09:00-18:00 |

### 2.5 - חלופות

| ספק | אתר | הערות |
|------|------|--------|
| Sumit (סמיט) | [sumit.co.il](https://www.sumit.co.il) | פופולרי, חשבוניות מובנות |
| iCount | [icount.co.il](https://www.icount.co.il) | הנהלת חשבונות + סליקה |
| Green Invoice | [greeninvoice.co.il](https://www.greeninvoice.co.il) | חשבוניות + סליקה |

> **הערה:** המערכת בנויה ל-Meshulam כספק ראשי. ספק אחר ידרוש התאמות בקוד.

> **שמור!** `MESHULAM_API_KEY` = _________________

---

## שלב 3: יצירת מפתחות הצפנה וסודות

**מה זה?** מפתחות שהמערכת צריכה כדי להצפין מידע רגיש ולאמת קריאות.

### 3.1 - פתח PowerShell
לחץ **Win + X** ← בחר **Windows PowerShell**

### 3.2 - צור ENCRYPTION_KEY (32 תווים)
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```
> **חשוב מאוד!** אם תאבד את המפתח הזה, לא תוכל לפענח API Keys של מטפלים שכבר שמרו. שמור במקום בטוח!

### 3.3 - צור CRON_SECRET
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 3.4 - צור MESHULAM_WEBHOOK_SECRET
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 3.5 - צור INCOMING_EMAIL_SECRET
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

> **סיכום שלב 3 - שמור לעצמך:**
> - `ENCRYPTION_KEY` = _________________________________
> - `CRON_SECRET` = _________________________________
> - `MESHULAM_WEBHOOK_SECRET` = _________________________________
> - `INCOMING_EMAIL_SECRET` = _________________________________

---

## שלב 4: הוספת משתני סביבה ב-Render

### 4.1 - היכנס ל-Render
1. גלוש ל-[dashboard.render.com](https://dashboard.render.com)
2. בחר את ה-Service שלך (**tipul-app**)
3. בתפריט הצדדי לחץ **Environment**

### 4.2 - הוסף את המשתנים הבאים

| # | Key | Value | הערות |
|---|-----|-------|--------|
| 1 | `ADMIN_EMAIL` | הכתובת מייל שלך | לקבלת התראות מנויים |
| 2 | `RESEND_API_KEY` | המפתח מ-Resend (re_...) | משלב 1.2 |
| 3 | `MESHULAM_API_KEY` | ה-Page Code מ-Meshulam | משלב 2.3 (אחרי אישור) |
| 4 | `MESHULAM_WEBHOOK_SECRET` | הסוד מ-3.4 | - |
| 5 | `ENCRYPTION_KEY` | 32 תווים מ-3.2 | שמור בנפרד! |
| 6 | `CRON_SECRET` | הסוד מ-3.3 | - |
| 7 | `INCOMING_EMAIL_SECRET` | הסוד מ-3.5 | - |

**משתנים שכבר אמורים להיות מוגדרים:**
- `DATABASE_URL` - כתובת PostgreSQL
- `NEXTAUTH_SECRET` - מפתח אימות
- `NEXTAUTH_URL` - כתובת האתר
- `NODE_ENV` = production

> אם חסר `NEXTAUTH_SECRET`, צור ב-PowerShell:
> `[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))`

### 4.3 - שמירה
1. לחץ **Save Changes**
2. Render יפעיל deploy אוטומטי
3. המתן 2-5 דקות

---

## שלב 5: הגדרת Webhook ב-Meshulam

> **עשה שלב זה רק אחרי ש-Meshulam אישרו את החשבון שלך!**

1. היכנס לחשבון Meshulam
2. לך ל-**הגדרות** ← **Webhooks**
3. הוסף Webhook חדש:
   - URL: `https://tipul-app.onrender.com/api/webhooks/meshulam`
   - (החלף `tipul-app` בשם ה-Service שלך ב-Render)
4. סמן אירועים:
   - ✅ תשלום התקבל
   - ✅ תשלום נכשל
   - ✅ מנוי נוצר
   - ✅ מנוי חודש
   - ✅ מנוי בוטל
5. שמור

---

## שלב 6: הגדרת Cron Jobs

> **חדשות טובות!** ה-Cron Jobs כבר מוגדרים ב-`render.yaml` ויופיעו אוטומטית.

### 6.1 - בדוק ב-Render
1. היכנס ל-[dashboard.render.com](https://dashboard.render.com)
2. חפש Services:
   - `subscription-reminders` (כל יום 09:00)
   - `admin-alerts-generator` (כל יום 08:00)
3. ודא שה-`CRON_SECRET` מוגדר בכל אחד מהם!

### 6.2 - אם לא הופיעו (או Free Plan)
השתמש ב-[cron-job.org](https://cron-job.org) (חינם):

| שם | URL | תזמון | Header |
|----|-----|--------|--------|
| Subscription Reminders | `https://tipul-app.onrender.com/api/cron/subscription-reminders` | כל יום 09:00 | `Authorization: Bearer YOUR_CRON_SECRET` |
| Admin Alerts | `https://tipul-app.onrender.com/api/cron/generate-alerts` | כל יום 08:00 | `Authorization: Bearer YOUR_CRON_SECRET` |

> החלף `YOUR_CRON_SECRET` בערך שיצרת בשלב 3.3!
> החלף `tipul-app` בשם ה-Service האמיתי!

---

## שלב 7: עדכון בסיס הנתונים (Prisma)

> **חדשות טובות!** ה-build command ב-Render כולל `prisma db push` - יעודכן אוטומטית בכל deploy!

מה שיתווסף אוטומטית:
- טבלת `TermsAcceptance` (הוכחה חוקית)
- שדות חדשים ב-User: `isFreeSubscription`, `freeSubscriptionNote`, `freeSubscriptionGrantedAt`

---

## שלב 8: בדיקות

### 8.1 - מיילים
- היכנס למערכת ← שלח מייל למטופל ← אם הגיע = Resend עובד

### 8.2 - דף Billing
- הגדרות ← מנוי ותשלום ← ודא: מסלולים, תקופות, checkbox תנאים, כפתורי שדרג

### 8.3 - פאנל אדמין
- ניהול מנויים ← ודא: טבלה, חיפוש, סטטיסטיקות, כפתורי פעולות

### 8.4 - Meshulam (אחרי אישור)
- נסה לשלם ← ודא webhook בלוגים ← ודא סטטוס ACTIVE

### 8.5 - Cron (למחרת)
- בדוק ב-Render Logs שב-08:00 ו-09:00 ה-cron jobs רצו

---

# חלק ב: סיכום כל השינויים שנעשו

## קבצים חדשים (6)

| # | קובץ | מה עושה |
|---|-------|---------|
| 1 | `src/lib/pricing.ts` | מקור אמת מרכזי לכל המחירים |
| 2 | `src/lib/rate-limit.ts` | Rate Limiter |
| 3 | `src/lib/billing-logger.ts` | לוג API לספקי סליקה |
| 4 | `src/lib/webhook-retry.ts` | שמירת webhooks שנכשלו |
| 5 | `src/app/api/admin/subscribers/route.ts` | API חיפוש מנויים |
| 6 | `src/app/api/admin/terms/route.ts` | API אישורי תנאים |

## קבצים שעודכנו (13)

| # | קובץ | מה השתנה |
|---|-------|----------|
| 7 | `prisma/schema.prisma` | TermsAcceptance + שדות חינם |
| 8 | `src/lib/auth.ts` | CANCELLED+עתיד=ACTIVE, PAUSED=PAST_DUE |
| 9 | `webhooks/meshulam/route.ts` | תקופה דינמית, ניקוי חינם |
| 10 | `subscription/create/route.ts` | תנאים צד-שרת + TermsAcceptance |
| 11 | `subscription/cancel/route.ts` | התאמת הנחה לביטול |
| 12 | `subscription/status/route.ts` | isActive נכון |
| 13 | `admin/users/[id]/route.ts` | grantFree, revokeFree, extendDays |
| 14 | `cron/subscription-reminders` | תזכורות כולל CANCELLED |
| 15 | `cron/generate-alerts` | התראות כולל CANCELLED |
| 16 | `settings/billing/page.tsx` | דף billing מלא |
| 17 | `settings/integrations/page.tsx` | כפתור "בדוק חיבור" |
| 18 | `admin/billing/page.tsx` | ניהול מנויים מלא |
| 19 | `admin-sidebar.tsx` | קישור אישורי תנאים |

---

# חלק ג: באגים שתוקנו (7)

| חומרה | באג | פירוט |
|--------|------|--------|
| **קריטי** | handlePaymentSuccess 30 יום | מנוי שנתי קיבל חודש. תוקן לדינמי |
| **קריטי** | handleSubscriptionCreated 30 יום | מנוי חדש שנתי קיבל חודש. תוקן |
| **קריטי** | revokeFree השאיר גישה | ביטול חינם נשאר ל-10 שנים. תוקן ל-7 ימים |
| בינוני | Fragment בלי key | React warning. תוקן |
| בינוני | handleSearch double-fetch | API כפול. תוקן |
| קל | Cron לא חסם CANCELLED | מנויים לא נחסמו. תוקן |
| קל | Dead import | הוסר |

---

# חלק ד: מה להוסיף בהמשך

1. **סנכרון מחירים Client/Server** - לאחד מקור אמת
2. **שיפור דף admin/terms** - חיפוש, CSV, פירוט
3. **Webhook ל-Sumit** - אם תשתמש בספק נוסף
4. **ביטול הוראת קבע אוטומטי** - API call ל-Meshulam
5. **חיוב התאמת הנחה** - חיוב בפועל דרך API

---

# חלק ה: זרימות מערכת

## רכישת מנוי
```
משתמש ← billing ← בוחר מסלול + תקופה
← מסמן תנאים ← "שדרג"
← Server: בדיקת תנאים + TermsAcceptance
← הפניה ל-Meshulam ← תשלום
← Webhook ← ACTIVE ← מייל אישור
```

## ביטול מנוי
```
משתמש ← "ביטול" ← חישוב התאמת הנחה
← CANCELLED (subscriptionEndsAt נשאר)
← גישה עד סוף תקופה ← grace 7 ימים ← חסום
```

## מנוי חינם
```
אדמין ← "מנוי חינם" ← מסלול + תקופה + הערה
← isFreeSubscription=true, ACTIVE ← מייל למנוי
```

## ביטול חינם
```
אדמין ← ביטול ← CANCELLED + 7 ימים grace
← מייל עם קישור לתשלום
← משלם ← webhook ← ACTIVE רגיל
```

---

## לגבי "הכפתור שהורד"
**לא הורד שום כפתור מהמסך!** הוסרה רק שורת import של אייקון Download שמעולם לא הוצג. אף אלמנט ויזואלי לא נפגע.
