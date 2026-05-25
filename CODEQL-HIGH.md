# CodeQL — High (~5-10 alerts)

## לצ'אט שיטפל: העתק את הקובץ הזה לצ'אט חדש ותגיד "תטפל בממצאי CodeQL High"

---

## 1. Use of password hash with insufficient computational effort
- **קובץ:** `src/lib/encryption.ts:119-125`
- **בעיה:** `hashApiKey()` משתמש ב-SHA-256 פשוט (hash מהיר) — CodeQL מתלונן שזה לא מספיק ל-brute-force resistance
- **הקשר:** זה ל-API key hashing, לא לסיסמאות. סיסמאות כבר ב-bcrypt cost 12. API keys הם high-entropy (128+ bit) אז SHA-256 מספיק טכנית, אבל כדאי לשקול HMAC-SHA256 עם מפתח סביבתי כדי שגם אם DB נחשף, ה-hashes חסרי ערך בלי המפתח.
- **תיקון מומלץ:** להחליף ל-`crypto.createHmac('sha256', process.env.API_KEY_HMAC_SECRET)` או להשאיר ולסגור כ-false-positive עם הערת `// CodeQL: API keys are high-entropy, SHA-256 is sufficient`

---

## 2. Incomplete multi-character sanitization (מספר קבצים)

CodeQL מזהה pattern של chained `.replace()` ל-HTML escaping ומתריע שההחלפות עלולות להיות לא שלמות. **בפועל הקוד נכון** (משתמש ב-regex /g ומתחיל מ-& קודם), אבל CodeQL עדיין מדווח.

### קבצים מדווחים:
| # | קובץ | שורה | הקשר |
|---|-------|------|-------|
| 2a | `src/lib/resend.ts` | 66, 216 | `html.replace(/<[^>]*>/g, '')` — strip HTML tags לצורך text fallback |
| 2b | `src/lib/export-utils.ts` | 339-343, 349 | `esc()` inline function ב-exportSummariesDocument |
| 2c | `src/lib/email-utils.ts` | 4-11 (+ ~51 callers) | `escapeHtml()` — הפונקציה המרכזית |

### ניתוח:
- `escapeHtml()` ב-email-utils.ts **כתוב נכון**: משתמש ב-`/g` regex, סדר נכון (& ראשון)
- הוא מיובא ב-**31 קבצים** — כל שימוש נספר כ-alert נפרד ב-CodeQL
- `html.replace(/<[^>]*>/g, '')` ב-resend.ts הוא strip-tags פשוט — CodeQL מתלונן שהוא לא מטפל ב-malformed HTML. בפועל זה רק fallback ל-text version של מייל, לא surface לתקיפה.

### אפשרויות:
1. **לסגור כ-false-positive ב-GitHub** — ללחוץ "Dismiss" על כל אחד עם הערה "Using /g regex, correct order"
2. **להחליף ל-DOMPurify** — `import DOMPurify from 'isomorphic-dompurify'` (כבר מותקן) לstrip tags
3. **להשאיר** — הקוד בטוח, CodeQL פשוט conservative

### המלצה:
אפשרות 1 (dismiss) לרוב ה-alerts. אפשרות 2 ל-resend.ts strip-tags שבאמת לא מושלם.

---

## 3. console.error ב-resend.ts (בעיה נלווית — לא CodeQL)

שורות 71, 82 ב-resend.ts משתמשות ב-`console.error` במקום `logger.error` — עלולות לדלוף PII (כתובת מייל). לתקן ל-logger.
