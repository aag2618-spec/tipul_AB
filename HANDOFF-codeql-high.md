# HANDOFF — CodeQL High Findings

## סבב: CodeQL High (~5 alerts)
## תאריך: 2026-05-26

---

## ממצאים

| # | ממצא | קובץ | סטטוס |
|---|------|------|--------|
| 1 | hashApiKey SHA-256 → HMAC-SHA256 | src/lib/encryption.ts:119 | done |
| 2 | strip-tags regex → DOMPurify | src/lib/resend.ts:66,216 | done |
| 3 | console.error → logger | src/lib/resend.ts:52,71,82,198 | done |

---

## פירוט

### 1. hashApiKey — HMAC-SHA256
- **בעיה:** SHA-256 פשוט, CodeQL מתלונן על insufficient computational effort
- **תיקון:** HMAC-SHA256 עם env var `API_KEY_HMAC_SECRET` + fallback ל-SHA256 אם חסר
- **Callers:** רק encryption.ts עצמו (exported אבל לא imported elsewhere)

### 2. strip-tags — DOMPurify
- **בעיה:** `html.replace(/<[^>]*>/g, '')` לא מטפל ב-malformed HTML
- **תיקון:** isomorphic-dompurify כבר מותקן — ניצור helper `stripHtmlTags()` ב-sanitize-html.ts
- **מיקומים:** resend.ts שורות 66, 216

### 3. console.error → logger
- **בעיה:** console.error/warn דולפים PII (כתובת מייל, error objects)
- **תיקון:** החלפה ל-logger.error/warn
- **מיקומים:** resend.ts שורות 52, 71, 82, 198
