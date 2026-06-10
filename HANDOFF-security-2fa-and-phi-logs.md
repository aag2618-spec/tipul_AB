# HANDOFF — סבב אבטחה: דליפת PHI ללוגים + עקיפת 2FA + ניקוי תבניות מייל

> נכתב 2026-06-10. מסמך מעקב לסבב אבטחה ממוקד. נוצר **בהתחלה** (לפי חוק 9 ב-`feedback_security_fixes`) כ-checklist.

## מצב המערכת והבטחת בטיחות
- **אין משתמשים ואין נתוני מטופלים אמיתיים** — זה הזמן הבטוח לתקן.
- כל שינוי הוא commit קטן ונפרד → הפיך ב-`git revert`.
- **push ל-production רק בסוף**, אחרי `tsc` נקי + `vitest` ירוק + `build` עובר + לולאת 5+2 סוכנים מאשרת.
- ⚠️ **צ'אטים מקבילים פעילים** — אסור `git add .`; רק שמות קבצים מפורשים. אסור לגעת בקבצים של צ'אטים אחרים.

## הרקע — איך הגענו לכאן
מסע חיפוש (3 סוכני Explore + אימות ידני של הקוד) ב-2026-06-10. המסקנה: המערכת **מוקשחת ברמה יוצאת דופן** (20+ סבבי אבטחה קודמים). **אין** פרצת IDOR / בידוד בין-קליניקות / הסלמת הרשאות / mass-assignment / SQL injection / סודות בקוד. נמצאו 3 פערים אמיתיים בלבד.

---

## ה-Checklist

### 🔴 פריט 1 — דליפת PHI/PII ללוגים (חמור; תיקון בטוח ומכני)
**סטטוס: ✅ done — commits cadc68a6 (regex+test) + 35ebbf20 (console→logger)**

שני חלקים:

**1א. רגקס ה-logger לא תופס `to` / `recipient` / `toNumber`** — `src/lib/logger.ts:30` (`SENSITIVE_KEY_REGEX`).
- תופס `phone`/`email` אבל לא מפתח בשם `to`/`recipient`/`toNumber` → טלפונים ואימיילים של מטופלים נכתבים גלוי ל-Render logs.
- מקומות מאומתים: `src/lib/sms.ts:254,671` (`{ to: phone }`), וכן לוגים רבים עם `recipient:` (send-link, debt-reminders, notifications, reminders).
- **תיקון:** להוסיף לרגקס `recipient` + `toNumber` + `to` מעוגן (`(^|_)to$`) כדי לא לפגוע ב-`total`/`token`/`history`. תיקון מרכזי אחד סוגר את כל המקומות.
- ⚠️ הערה: `recipient`/`to` הם גם שדות DB לגיטימיים (CommunicationLog) וגם פרמטר ל-`sendEmail({to})` — הרגקס משפיע **רק על פלט ה-logger**, לא על ה-DB ולא על שליחת מייל. אין סיכון תפקודי.

**1ב. `console.*` בקוד שרת עוקף את ה-sanitizer** — שופך תגובת-API שלמה של ספק חיוב (שם לקוח/סכום) ל-stdout.
- קבצים: `src/lib/icount/client.ts` (54,57,101,118,175), `src/lib/green-invoice/client.ts` (65,68,116), `src/lib/meshulam/client.ts` (66,80), `src/lib/sumit/client.ts` (65,78), `src/lib/sms.ts` (276,283,364,641), `src/lib/billing-logger.ts` (38), `src/lib/webhook-retry.ts` (55,73), `src/lib/google-calendar.ts` (100,143,166,212).
- **תיקון:** להחליף ל-`logger.*` עם context מובנה (רק שדות בטוחים: errorCode/status — לא הגוף המלא).
- **לא לגעת:** `src/lib/logger.ts:133-137` (זה הפלט הלגיטימי של ה-logger עצמו); dev-gated `if (isDev) console.log` (לא רץ ב-production); `src/lib/env.ts` (startup).

בדיקות: קובץ חדש `src/lib/__tests__/logger.test.ts` (TDD).

---

### 🟡 פריט 2 — חוסר escapeHtml ב-3 תבניות מייל (בינוני; תיקון זעיר)
**סטטוס: ✅ done — commit 9e9a9b6d**

`src/lib/email-templates.ts`: 4 הזרקות לא-מנוקות → `:97` `therapistName`, `:98` ו-`:133` `address`, `:226` `rejectionReason`. מטפל זדוני/פרוץ יכול להזריק HTML (פישינג/tracking) למייל של המטופל.
- **תיקון:** לעטוף כל אחת ב-`escapeHtml(...)` (קיים בקובץ, בשימוש כבר במקומות אחרים).
- **זה בדיוק שכבה 3 ב-`HANDOFF-email-security.md`.** אומת 2026-06-10 שעדיין פתוח. לעדכן שם בסיום. רק את הקובץ הזה — להיזהר מצ'אט מקביל של אבטחת מייל.

---

### 🔴 פריט 3 — עקיפת 2FA בין-sessions (חמור; עדין — נוגע בהתחברות)
**סטטוס: ✅ done — tsc נקי, 879 בדיקות עוברות (כולל two-factor-binding), build עובר**

`src/lib/auth.ts:538-570` (jwt callback) מנקה `requires2FA` לפי `verifiedAt/lastLoginAt > token.loginAt` (טווח) במקום שיוך מדויק ל-login. תוקף עם הסיסמה יכול "להחנות" session ולחכות שהקורבן יעבור 2FA → לשדרג את ה-session שלו.
- **תיקון (Option B מאומת ע"י סוכן Plan):** שדה חדש `User.twoFactorVerifiedForLoginAt BigInt?`; ה-verify endpoint נעשה session-aware (`getToken`, דורש `requires2FA` + email תואם), חותם את `token.loginAt`; ה-callback מנקה רק על **שוויון מדויק** (`===`). מכסה TOTP + email-OTP + recovery.
- קבצים: `prisma/schema.prisma`, `src/lib/two-factor.ts`, `src/app/api/auth/2fa/verify/route.ts`, `src/lib/auth.ts`. בדיקות: `src/lib/__tests__/two-factor-binding.test.ts`.
- schema: שדה nullable → `prisma db push` בטוח, בלי data loss.

---

## פריטים שתועדו לסבב עתידי (לא בסבב הזה)
- 2FA מדלג ל-USER/MANAGER/SECRETARY בחלון 3 שעות חוסר-פעילות (`two-factor.ts:122`) — UX tradeoff מתועד.
- rate-limit בזיכרון (per-instance) — בטוח כל עוד instance בודד; לפני scale-out → Redis.
- מדיניות סיסמה length-only (אין בדיקת breach/HIBP).
- reset-password לא מנקה `failedLoginAttempts`/`lockedUntil`.
- CSP עם `'unsafe-inline'` ל-script-src.
- PHI על דיסק מקומי אם `S3_BUCKET` לא מוגדר — **לאמת ב-Render** שמוגדר.
- שמות/אימייל/טלפון/ת.ז. plaintext ב-DB (backfill הצפנה נדחה לסבב בתשלום).

## תהליך לפני push (חובה)
`npx tsc --noEmit` → `npx vitest run` → `npm run build` → לולאת 5 סוכנים (3 סנכרון + 2 תקינות) + 2 סוכני סייבר → עד שכולם ✅ → push אוטומטי. `git add` שמות מפורשים בלבד.
