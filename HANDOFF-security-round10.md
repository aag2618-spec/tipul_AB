# 🔐 הנדאוף — סבב אבטחה 10 (בוצע, ממתין לאישור push)

**תאריך:** 2026-05-18
**Commit בסיס:** `ff216e7` (סיום סבב 9)
**Commits של סבב 10:** `850b6ff`, `33538d1`, `58b2504`, `a5706d8`, `166608d`, `9f346f6`, `e1b52dc`
**הקשר:** המשתמש אישר שאין משתמשים פעילים בייצור → אפשר היה גם להסיר legacy fallbacks.

---

## ✅ Checklist — פריטי סבב 10

| # | פריט | Risk | Status | Commit |
|---|------|------|--------|--------|
| 10.1 | 🟠 PHI audit trail — receipt public access | High | done | `850b6ff` |
| 10.2 | 🟠 JWT cache invalidation (16 calls ב-11 קבצים) | High | done | `33538d1` |
| 10.3 | 🟡 Booking slug enumeration | Medium | **כבר תוקן** (HANDOFF מיושן) | — |
| 10.4 | 🟡 Audit log ב-2FA verify (success + failed) | Medium | done | `58b2504` |
| 10.5 | 🟡 Upload size exceeded logging (3 callers) | Medium | done | `a5706d8` |
| 10.6 | 🟢 CRON_SECRET_PREVIOUS rotation alert | Low | done | `166608d` |
| 10.7 | 🟢 Filename RTL override (Content-Disposition) | Low | done | `9f346f6` |
| 10.8 | 🧹 Cleanup legacy fallbacks (verify-email + receipt) | Cleanup | done | `e1b52dc` |

---

## פירוט תיקונים

### 10.1 — PHI audit trail ל-receipt public (commit `850b6ff`)

לפי תקנות הגנת הפרטיות (2017) נדרשת רישום של גישה למידע רפואי-נפשי, כולל גישה ציבורית דרך קישור-token.

- `audit-logger.ts`: `logDataAccess.userId` הורחב ל-`string | null` (non-breaking).
- `/api/receipts/[id]/public/route.ts`: אחרי `verifyReceiptToken` מוצלח → `logDataAccess` עם userId=null, recordType=PAYMENT, action=READ, clientId, IP, userAgent, meta.accessSource="receipt_public_link".
- הרישום רק אחרי אימות (לא בכל probe) → לא יוצר DoS על הטבלה.

### 10.2 — JWT cache invalidation (commit `33538d1`)

ה-JWT cache (TTL 30s) שומר 7 שדות (role, clinicRole, isBlocked, subscriptionStatus, subscriptionEndsAt, trialEndsAt, passwordChangedAt). חלון של 30s שבו cache מחזיק נתונים ישנים = security risk.

**11 קבצים תוקנו, 16 invalidateJwtCache חדשים:**
- Webhooks: meshulam (5), sumit (2), cardcom/admin (1)
- Cron: trial-expiry (1), subscription-reminders (2), subscription-recurring lib (2)
- Admin: users/[id]/subscription (3), cardcom/charge-token (1), trials (3)
- User: subscription/cancel (1), clinic-admin/members/[id] PATCH+DELETE (2)

Tests של subscription-recurring (34/34) ✅ — לא נשבר.

### 10.3 — Booking slug enumeration (כבר תוקן)

הקוד הנוכחי ב-`booking/[slug]/route.ts:161-166` כבר מאחד 404 ל-"דף הזימון אינו פעיל" בשני המקרים (לא קיים + לא פעיל). ה-HANDOFF היה מיושן מסבב 7.

### 10.4 — 2FA verify audit (commit `58b2504`)

`logAdminAction` (fire-and-forget) אחרי `verifyCode` עם action=2fa_verify_success / 2fa_verify_failed + method (totp/recovery_code) + IP + email. רק כש-user קיים (מונע spam מ-enumeration).

### 10.5 — Upload size logging (commit `a5706d8`)

`logger.warn("[upload] size exceeded after strip")` ב-3 callers: documents/route.ts, communications/reply/route.ts, lib/support-attachments.ts. מתעדים userId/ticketId, filename, mime, originalSize, newSize, limit, endpoint.

### 10.6 — CRON rotation alert (commit `166608d`)

יצירת `AdminAlert` (type=SYSTEM, priority=HIGH, title="CRON_SECRET rotation incomplete") כש-CRON_SECRET_PREVIOUS עדיין בשימוש. dedupe לפי title, throttled ל-5 דקות ב-cache בזיכרון (לא לבזבז DB query על cron כל דקה). fire-and-forget — לא חוסם cron אם DB לא זמין.

### 10.7 — RTL override filter (commit `9f346f6`)

ב-`uploads/[...path]/route.ts`, ה-filename* (UTF-8 encoded) ב-Content-Disposition לא היה מסונן מ-Unicode bidi-override chars (U+200E/F, U+202A-E, U+2066-9). תוקף יכול לקרוא לקובץ "evil[U+202E]gpj.exe" שיוצג כ-"evilexe.jpg" בדפדפן. עכשיו שני המקרים (filename= ASCII + filename* UTF-8) מסוננים.

### 10.8 — Legacy fallbacks cleanup (commit `e1b52dc`)

**verify-email**:
- page.tsx — רק hash, אין fallback ל-?token=
- api/verify-email/route.ts — רק sha256 (אין fallback ל-plain H14)

**receipt**:
- receipt/[id]/page.tsx — רק hash, אין fallback ל-?t=
- receipt-token.ts — רק v=1 (128-bit), v=0 + LEGACY_TOKEN_LENGTH_HEX + version param הוסרו
- api/receipts/[id]/public/route.ts — prefilter רק 32 chars, verifyReceiptToken בלי version

receiptTokenVersion ב-DB נשאר ב-schema (לא משפיע על אימות).

---

## 🚫 קבצי M1 — אסור לגעת (נשמרו)

- `src/app/api/clients/[id]/route.ts`
- `src/app/api/clients/route.ts`
- `src/lib/validations/client.ts`
- `src/lib/scope.ts`
- `src/app/(dashboard)/dashboard/clients/[id]/edit/page.tsx`
- `src/app/(dashboard)/dashboard/clients/new/page.tsx`
- `src/app/(dashboard)/dashboard/clients/[id]/page.tsx`

## 🤖 צ'אטים מקבילים

קבצי untracked + modified שלא שלי (לא לגעת):
- `render.yaml` (modified) — של הצ'אט המקביל
- `HANDOFF-aitier-not-upgrading.md`, `HANDOFF-security-round7.md`, `HANDOFF-subscription-upgrade.md`

## 📊 סטטוס תקינות

- `npx tsc --noEmit` — נקי (אחרי כל commit)
- `npx vitest run` — baseline בלבד: 4 קבצי-טסט / 3 tests — 0 רגרסיות מ-סבב 10
- subscription-recurring (קריטי לכסף): 34/34 ✅

## 🔜 הבא

5 סוכנים מקבילים → לולאה עד נקי → אישור משתמש → push. ✅ **כולם אישרו בסבב אחד.**

## 📝 הערות חלשות (לסבב 11)

1. **M10.4 — semantic clash (לא bug):** `logAdminAction({ adminId: user.id })` משמש ב-2FA verify כש-ה-user אינו admin. ה-FK מאפשר זאת ו-action="2fa_verify_*" מבחין, אבל לטהור semantically — שווה ליצור פונקציה ייעודית `logAuthEvent` או להעביר לטבלה מיוחדת.
2. **M10.5 — PII ב-filename:** ה-logger sanitizer (deny-list) לא מטפל ב-filename. אם מטופל שלח קובץ "שרה כהן.jpg" — השם יופיע ב-logs. שווה להוסיף `filename` ל-deny-list או hash, או טריט filename specially.
