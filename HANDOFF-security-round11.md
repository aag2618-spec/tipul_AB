# 🔐 הנדאוף — סבב אבטחה 11 (בוצע, ממתין לאישור push)

**תאריך:** 2026-05-18
**Commit בסיס:** `c3f66e7` (סיום סבב 10 + cron consolidation)
**מקור התוכנית:** `C:\Users\User\.claude\plans\purring-prancing-bee.md`

---

## ✅ Checklist — פריטי סבב 11

| # | פריט | Severity | Status | קבצים |
|---|------|----------|--------|--------|
| C1 | 🔴 HTML injection ב-emails | Critical | done | `admin/users/[id]/route.ts` |
| H1 | 🟠 JWT cache: subscription/aiTier missing invalidate | High | done | `admin/users/[id]/route.ts:725` |
| H2 | 🟠 הסרת members/search לגמרי + UI invite-only | High | done | route מחוק + `members/page.tsx` |
| M1 | 🟡 Filename PII בlogger (hash approach) | Medium | done | `logger.ts` |
| M2 | 🟡 Phone race ב-clinic-invite/accept | Medium | done | `clinic-invite/[token]/accept/route.ts` |
| L1 | 🟢 Credits underflow guard | Low | done | `credits.ts` + `credits.test.ts` |
| L2 | 🟢 Encryption dev fallback (deterministic) | Low | done | `encryption.ts` |
| L3 | 🟢 Logger MAX_DEPTH 4→6 | Low | done | `logger.ts` |

---

## 🎯 רקע

המערכת עברה 10 סבבי אבטחה. בסבב 11 בוצעה סקירה מקיפה (3 סוכני Explore מקבילים + אימות ידני) למציאת **חולשות חדשות** שלא נסקרו עד כה. כל ממצא אומת מול הקוד לפני הכנסה לתוכנית, ולאחר התיקון אומת ע"י 5 סוכני pre-push.

---

## פירוט תיקונים

### C1 — HTML Injection במיילים (`admin/users/[id]/route.ts`)

**הבעיה:** הקובץ בנה תוכן email דרך template literals עם `${updatedUser.name}` ב-4 מיילים (grantFree, block, unblock, revokeFree) בלי `escapeHtml`. השם נשלט ע"י המשתמש (settings) ויכול להכיל HTML/JS.

**הגילוי שכל שאר הקבצים בטוחים:** סריקת 38 sendEmail callers הראתה ש-37 מהם משתמשים ב-templates מרכזיים (`email-templates.ts`, `email-templates/payment-receipt.ts`, `email-templates/payment-history.ts`, `dunning.ts`) או ב-`escapeHtml` ישיר (`booking-outbox`, `auth.ts`, `cardcom/user/route.ts` וכו'). רק `admin/users/[id]/route.ts` היה ללא escape.

**תיקון:** הוסף `import { escapeHtml } from "@/lib/email-utils"` + עטיפת כל 4 ה-`${updatedUser.name || ""}` ב-`${escapeHtml(updatedUser.name || "")}`.

---

### H1 — JWT Cache Invalidation: שדות subscription

**הבעיה:** JWT cache (`src/lib/auth.ts:18-26`) מחזיק `role/clinicRole/isBlocked/subscriptionStatus/subscriptionEndsAt/trialEndsAt/passwordChangedAt`. ה-PATCH של admin/users/[id] קרא ל-`invalidateJwtCache` רק כש-`role || isBlocked` השתנו. שינוי `subscriptionStatus`/`subscriptionEndsAt`/`aiTier`/`grantFree`/`revokeFree`/`extendDays` לא ביטל cache → חלון 30s שבו admin מבטל מנוי אבל המשתמש ממשיך לגשת לדשבורד.

**תיקון:** הרחבת התנאי לכל 8 השדות הרלוונטיים. `trialEndsAt` לא נכלל כי ה-PATCH הזה לא משנה אותו ישירות (משונה ב-`admin/users/[id]/subscription` route נפרד שכבר קורא ל-invalidate).

---

### H2 — הסרת members/search + UI invite-only

**הבעיה:** `clinic-admin/members/search/route.ts` השתמש ב-Prisma `contains: q, mode: "insensitive"` ללא escape של `_`/`%` (Postgres ILIKE wildcards). תוקף עם CLINIC_OWNER יכול לעשות `?q=__` ולקבל רשימת משתמשים שלא בקליניקה.

**החלטת המשתמש:** במקום לתקן wildcards — **לבטל את ה-feature לחלוטין**. בעלת קליניקה שמזמינה מטפל יודעת את ה-email שלו; היא לא צריכה "חיפוש מטפלים במערכת".

**תיקון:**
1. נמחק: `src/app/api/clinic-admin/members/search/route.ts` (64 שורות)
2. UI: `src/app/clinic-admin/members/page.tsx` — הוסר Dialog של "קישור מהיר" + Search state/effects (192 שורות)
3. נשאר: "הזמנת חבר/ה חדש/ה" → `/clinic-admin/invitations` (flow קיים, מאובטח, דרך email + OTP)

**הערה לסבב 12:** ה-`POST /api/clinic-admin/members` route נשאר קיים (לא ב-scope). אם תוקף יודע user.id של USER חופשי, יכול לקשר אותו לקליניקה שלו בלי הסכמתו. UI כבר לא משתמש בו, אבל ה-endpoint עדיין פתוח. שווה להעיף או לדרוש confirmation token בסבב הבא.

---

### M1 — Filename PII (logger.ts) + L3 — MAX_DEPTH

**M1:** הוסף `FILENAME_KEY_REGEX = /^(original)?[Ff]ile[Nn]ame$/` שתופס `filename`/`originalFilename`/`fileName`/`originalFileName` (לא name גנרי). הפונקציה `hashFilename(value)` מחזירה `[FILE:<8hex>.<ext>]` — שומר extension לdebug של תאימות סוג קובץ, hashing את השם.

**L3:** `MAX_DEPTH` הועלה מ-4 ל-6. webhook payloads מקננים יותר עמוק; truncation על depth 4 חתך פרטי debug.

---

### M2 — Phone race condition

**הבעיה:** `clinic-invite/[token]/accept/route.ts` בדק `phone uniqueness` פעמיים — פעם לפני `withAudit` (race-prone TOCTOU) ופעם בתוך. שני requests מקבילים → unique violation → 500.

**תיקון:** הוסר ה-pre-check לפני withAudit. הצ'ק בתוך ה-tx (Serializable + retry על 40001) מספיק race-safe. UX זהה: HandledError(400) במקרה של duplicate.

**הערה לסבב 12 (מסוכן 3):** אין `@@unique([phone])` ב-`prisma/schema.prisma`. ה-application-level check תופס race, אבל אם מישהו שותל data ידנית ב-DB — אין enforcement. שווה להוסיף constraint כ-defense-in-depth (דורש migration + handling של מצב הנוכחי בDB).

---

### L1 — Credits underflow guard

**הבעיה:** `refundInTx` ב-`credits.ts` הריץ `decrement` ישירות בלי בדיקה. comment בקובץ (`credits.ts:421-423`) הודה: "לא בודק תקינות... מנהל מערכת עלול לשנות ידנית בין consume ל-refund". אם creditsUsed יורד מתחת ל-0, משתמש מקבל שירותים חינם בלי הגבלה.

**תיקון:** קריאת `findUnique` לפני decrement. אם תוצאה < 0 → `logger.error` + `AdminAlert(type=CREDIT_CONSUMPTION_FAILED, priority=HIGH)` + clamp ל-0 (לא throw — לא חוסם refund לגיטימי). ה-AdminAlert נותן audit trail לbug תחזוקה.

**עדכון tests:** הוסף `purchaseFindUnique` ל-mock ב-`credits.test.ts` עם default `{ creditsUsed: 1000 }` שלא יוצר underflow ב-tests רגילים. 19/19 tests עוברים.

---

### L2 — Encryption dev fallback

**הבעיה:** `encryption.ts:3-9` ב-dev (NODE_ENV != production) יצר `crypto.randomBytes(32)` בכל restart → encrypted data ב-DB לא ניתן לפענוח אחרי restart.

**תיקון:** Dev fallback דטרמיניסטי — `sha256(DATABASE_URL || "tipul-dev-fallback-seed").slice(0, 42)`. prod עדיין throws אם `ENCRYPTION_KEY` חסר. ה-fallback רץ רק אם `NODE_ENV !== "production"` AND `ENCRYPTION_KEY` לא הוגדר → ב-Render (`NODE_ENV=production`) זה לא יכול לרוץ.

---

## 🚫 קבצי M1 — אסור לגעת (נשמרו)

- `src/app/api/clients/[id]/route.ts`
- `src/app/api/clients/route.ts`
- `src/lib/validations/client.ts`
- `src/lib/scope.ts`
- `src/app/(dashboard)/dashboard/clients/[id]/edit/page.tsx`
- `src/app/(dashboard)/dashboard/clients/new/page.tsx`
- `src/app/(dashboard)/dashboard/clients/[id]/page.tsx`

## 🤖 צ'אטים מקבילים — נשמרו

- `HANDOFF-aitier-not-upgrading.md`
- `HANDOFF-subscription-upgrade.md`
- `HANDOFF-security-round7.md`

## 📊 סטטוס תקינות

- ✅ `npx tsc --noEmit` — 0 errors
- ✅ `npx vitest run` — 4 test files / 3 tests failed (baseline נשמר; זהה ל-HANDOFF-round10)
- ✅ `credits.test.ts` — 19/19 passed (אחרי עדכון mocks ל-L1)
- ✅ 5 סוכני pre-push מקבילים אישרו

---

## 📝 הערות לסבב 12

1. **`POST /api/clinic-admin/members`** — endpoint נשאר פתוח אחרי הסרת ה-search. אם תוקף יודע user.id, יכול לקשר משתמש לקליניקה בלא הסכמתו. שווה לבטל (UI לא משתמש) או להוסיף confirmation token.

2. **`@@unique([phone])` ב-User schema** — חסר constraint ב-DB. ה-Serializable tx ב-clinic-invite/accept תופס race, אבל אין defense-in-depth.

3. **`trialEndsAt` ב-JWT cache invalidation** — ה-PATCH של `admin/users/[id]` לא משנה אותו ישירות, אבל אם נוסיף בעתיד שדה שמשנה אותו, צריך לזכור להוסיף לתנאי ה-invalidate.

4. **dev encryption key tied to DATABASE_URL** — אם מפתח dev מחליף DB, encrypted data ישנה לא תפוענח. עדיף `.env.local` עם key פיזי. שווה תיעוד ב-README.

---

## 🔜 הבא

5 סוכנים אישרו → ממתין לאישור משתמש → push.

**Commits בסבב 11 (כל אחד יבוצע בנפרד אחרי אישור):**
- `security(C1): escape HTML in admin/users/[id] emails`
- `security(H1): invalidate JWT cache on subscription/aiTier change`
- `security(H2): remove clinic members search (invite-only flow)`
- `security(M1,L3): hash filenames in logger + bump MAX_DEPTH to 6`
- `security(M2): remove phone TOCTOU pre-check in clinic-invite/accept`
- `security(L1): credits refund underflow guard + AdminAlert`
- `security(L2): deterministic dev encryption key`
