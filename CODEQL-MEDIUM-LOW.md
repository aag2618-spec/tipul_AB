# CodeQL — Medium + Low (~200 alerts)

## לצ'אט שיטפל: העתק את הקובץ הזה לצ'אט חדש ותגיד "תטפל בממצאי CodeQL Medium/Low"

---

## הרוב המוחלט = חזרות של "Incomplete multi-character sanitization"

CodeQL סופר **כל קריאה ל-`escapeHtml()`** כ-alert נפרד. הפונקציה מיובאת ב-31 קבצים, וחלקם קוראים לה מספר פעמים → ~200 alerts מאותו סוג.

### רשימת 31 הקבצים שמשתמשים ב-escapeHtml/esc:
```
src/lib/email-templates.ts
src/lib/email-utils.ts
src/lib/export-utils.ts
src/lib/resend.ts
src/lib/two-factor.ts
src/lib/auth.ts
src/lib/shabbat.ts
src/lib/emails/dunning.ts
src/lib/cardcom/sync-cardcom-payment.ts
src/lib/email-templates/payment-receipt.ts
src/lib/email-templates/payment-history.ts
src/app/api/admin/users/[id]/route.ts
src/app/api/admin/users/[id]/disable-2fa/route.ts
src/app/api/communications/reply/route.ts
src/app/api/webhooks/meshulam/route.ts
src/app/api/webhooks/cardcom/user/route.ts
src/app/api/cron/subscription-reminders/route.ts
src/app/api/cron/debt-reminders/route.ts
src/app/api/cron/trial-expiry/route.ts
src/app/api/cron/notifications/route.ts
src/app/api/cron/departure-deadlines/route.ts
src/app/api/cron/booking-outbox/route.ts
src/app/api/subscription/cancel/route.ts
src/app/api/auth/forgot-password/route.ts
src/app/api/auth/register/route.ts
src/app/api/booking/[slug]/route.ts
src/app/api/payments/[id]/send-cardcom-link/route.ts
src/app/api/sessions/[id]/route.ts
src/app/api/sessions/[id]/status/route.ts
src/app/api/user/booking-settings/send-link/route.ts
src/app/api/clients/[id]/send-debt-reminder/route.ts
```

### מה לעשות?

**אפשרות א' (מומלצת): Bulk dismiss ב-GitHub**
1. כנס ל-GitHub → Security → Code scanning
2. סנן לפי Rule: "Incomplete multi-character sanitization"
3. סמן את כל ה-alerts (checkbox למעלה)
4. לחץ "Dismiss selected" → "False positive" → הערה: "escapeHtml() uses /g regex with correct & → < → > → \" order"

**אפשרות ב': הוספת CodeQL suppression**
בקובץ `.github/codeql-config.yml` ניתן להוסיף:
```yaml
query-filters:
  - exclude:
      id: js/incomplete-multi-character-sanitization
```
(זה יסתיר את כל ה-alerts מסוג זה — רק אם בטוחים שהקוד נכון)

**אפשרות ג': החלפת escapeHtml ל-ספרייה**
להחליף את `escapeHtml()` הידני ב-`import { escape } from 'lodash-es'` או ב-DOMPurify. זה יסתיר את ה-alerts כי CodeQL מכיר ספריות ידועות. **אבל** — הקוד הנוכחי **עובד נכון**, זה רק CodeQL שconservative.

---

## סוגים נוספים אפשריים (Medium/Low)

| סוג | הסבר | סטטוס |
|------|--------|--------|
| Clear-text logging | console.error עם error objects — עלולים להכיל PII | לתקן → logger |
| Unused variable | משתנים שלא בשימוש | קוסמטי |
| Expression injection in workflows | אם יש GitHub Actions עם `${{ }}` | לבדוק |
| Polynomial regex | regex שעלולים ליצור ReDoS | נבדק — לא נמצאו בעייתיים |

---

## סיכום

~200 מתוך 216 alerts הם **false positives** של "Incomplete multi-character sanitization" כי CodeQL לא מזהה שהקוד משתמש ב-/g regex בסדר הנכון. ההמלצה: **bulk dismiss ב-GitHub**.
