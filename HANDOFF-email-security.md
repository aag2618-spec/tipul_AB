# HANDOFF — הקשחת אבטחת מיילים (MyTipul)

> **מסמך העברה לצ'אט חדש.** קרא אותו במלואו לפני שאתה נוגע בקוד. נכתב ב-2026-06-01 בסוף צ'אט שבנה את פיצ'ר הזימון העצמי האישי. המטרה: להקשיח את אבטחת המיילים של המערכת **ברמה הגבוהה ביותר** (defense-in-depth), בצורה בטוחה ומבוקרת.

---

## ✅ עדכון התקדמות — 2026-06-02

**שכבה 1 הושלמה ונדחפה ל-`main`** — commit `c8e25b22`.
- ניקוי מרכזי ב-`src/lib/resend.ts` (`sendEmail` + `sendEmailRaw`): נושא ונמען מנוקים מ-`\r\n\t` ומפסיק/נקודה-פסיק; נושא נחתך בצורה בטוחה-יוניקוד ל-200 תווים; `logger.warn` בזיהוי ניסיון (בלי הערך).
- עזר חדש `safeEmailSubject()` ב-`src/lib/email-utils.ts`.
- בדיקות: `src/lib/__tests__/resend-sanitization.test.ts` (חדש) + הרחבת `email-utils.test.ts`. `tsc` נקי, eslint נקי, 793 בדיקות עוברות.
- ביקורת 3 סוכנים (אבטחה / תאימות-לאחור / קצוות): אין חוסם; 2 שיפורים שהוצעו יושמו (ניקוי `to` גם ב-`sendEmailRaw`, חיתוך בטוח-יוניקוד).

**נשאר פתוח (לפי הסדר למטה):** שכבה 2 (validation בקלט), שכבה 3 (escapeHtml ב-2 תבניות), שכבה 4 (recipient ב-bulk-send), שכבה 5 (ניקוי SMS), שכבה 6 (regex ב-logger). שכבה 1 לבדה סוגרת את עיקר משטח התקיפה.

---

## 🔵 הערה מצ'אט מקביל (תיקון יישור מיילים) — 2026-06-12

צ'אט שתיקן **יישור תצוגה** בתבניות מייל תשלום נתקל ב-XSS באותם קבצים והקשיח חלק. **כבר תוקן ונדחף ל-`main`** (אל תחזרו על זה):
- `src/lib/email-templates/payment-receipt.ts` (commit `920d9a7c`): `receiptNumber` → `escapeHtml`; `receiptUrl` ב-href → `safeHttpUrl` + `escapeHtml` (זהה להגנת M-XSS-1 הקיימת על `paymentLink` באותו קובץ).
- `src/app/api/webhooks/meshulam/route.ts` → `createSubscriptionConfirmHtml` (commit `a9f0c331`): `receiptUrl` (מגיע מ-`documentUrl` של ה-webhook — **קלט חיצוני**) ב-href → `safeHttpUrl` + `escapeHtml`; `name` בברכה → `escapeHtml`.

**נשאר פתוח עבורכם (XSS בגוף HTML — משלים לשכבה 3):**
1. `src/app/api/webhooks/meshulam/route.ts` → `createAdminPaymentHtml`: `userName` / `userEmail` / `message` מוזרקים **גולמית**. מייל פנימי (נשלח ל-ADMIN_EMAIL בלבד) → סיכון נמוך יותר, אבל המנהל הוא יעד בעל ערך. לעטוף ב-`escapeHtml`.
2. כתובות URL גולמיות ב-`href`/`src` בתבניות נוספות (owner-controlled, סיכון בינוני) — לא עוברות `safeHttpUrl`:
   - `src/lib/email-templates/payment-history.ts`: `paymentLink` (href), `logoUrl` (src).
   - `src/app/api/clients/[id]/send-debt-reminder/route.ts` + `src/app/api/cron/debt-reminders/route.ts`: `paymentLink` (href).
3. **כדאי לאחד:** `safeHttpUrl` כרגע משוכפל ב-`payment-receipt.ts` וב-`meshulam/route.ts` (וגם inline ב-`cardcom/admin/route.ts`). מומלץ לרכז אותו ב-`src/lib/email-utils.ts` (לצד `escapeHtml`/`safeEmailSubject`) ולייבא בכל המקומות.

(הקובץ הזה — `HANDOFF-email-security.md` — לא נדחף; נשאר בעץ העבודה המקומי בלבד, לטיפולכם.)

---

## 0. קרא קודם — מי המשתמש ואיך עובדים איתו

- המשתמש הוא **מטפל, לא מתכנת** — להסביר הכל **בעברית פשוטה וברורה**, בלשון זכר (אתה/שלך).
- **תקשורת בעברית בלבד.** לא לערבב מילים באנגלית בתוך משפט בעברית (משבש כיוון קריאה). שמות קבצים/מונחים טכניים — בשורה נפרדת או ב-backticks.
- כל קבצי הכללים נטענים אוטומטית דרך `MEMORY.md` (בתיקיית הזיכרון). **חובה לפעול לפיהם.** הקבצים הכי חשובים לקרוא:
  - `feedback_coding_standards.md` — תקני קוד (T3 Stack, force-dynamic, logger, Prisma Decimal, auth).
  - `feedback_security_fixes.md` — כללי עבודה לתיקוני אבטחה (קריטי למשימה הזו!).
  - `feedback_pre_push.md` — תהליך הסוכנים לפני push.
  - `feedback_parallel_chats.md` — יש צ'אטים מקבילים, לא לגעת בעבודתם.
  - `feedback_critical_changes_process.md` — TDD + ביקורת Cursor לשינויים קריטיים.
- שני ממצאי הזיכרון הרלוונטיים: `project_email_header_injection.md` (החוב), `project_self_booking.md` (מה נבנה לפני).

---

## 1. המשימה במשפט אחד

לנקות **תווי שורה (`\r\n\t`) וקלט לא-בטוח** מכל המיילים וה-SMS של המערכת, במקום מרכזי אחד + שכבות הגנה משלימות, כדי לסגור פגיעות **Email Header Injection** ווקטורים נלווים — ברמת defense-in-depth מלאה.

---

## 2. רקע — מה כבר קרה (אל תיגע בזה שוב)

בצ'אט הקודם נבנה פיצ'ר **זימון עצמי אישי** (commit `cb136f7f`, כבר על `origin/main`):
- קישור אישי לכל מטופל (`BookingLink`, token 256 ביט + OTP, תוקף 60 יום) במקום קישור כללי פתוח.
- במהלך הביקורת התגלתה הפגיעות שהמסמך הזה בא לסגור באופן מערכתי.
- כבר נוצר helper מוכן: **`sanitizeEmailSubject()`** ב-[src/lib/email-utils.ts](src/lib/email-utils.ts) (מסיר `[\r\n\t]+` → רווח, ועושה trim). **תשתמש בו — אל תיצור חדש.**
- הוא הוחל **רק** על 2 קבצים: [send-link/route.ts](src/app/api/user/booking-settings/send-link/route.ts) ו-[booking/t/[token]/route.ts](src/app/api/booking/t/%5Btoken%5D/route.ts). שאר המערכת עדיין חשופה.

---

## 3. הבעיה — Email Header Injection (הסבר)

מיילים בנויים מ"כותרות" נסתרות (אל / מאת / עותק-נסתר Bcc) שמופרדות בתו "שורה חדשה" (`\r\n`). הקוד בונה שורת **נושא** ע"י הדבקת שם משתמש/מטפל/לקוח, למשל: `` `אישור תור - ${therapistName}` ``. אם שם מכיל `\r\n`, תוקף יכול "לשבור" את שורת הנושא ולהוסיף כותרת משלו (למשל `Bcc: גנב@דוגמה.com`) ולקבל עותק נסתר של מייל עם מידע רפואי.

### הערכת סיכון כנה (חשוב — לא להגזים, לא לזלזל)
- המערכת שולחת דרך **Resend ב-HTTP API (JSON)**, לא SMTP גולמי. ה-subject הוא שדה JSON ש-Resend עושה לו encoding בצד שלהם → **בפועל header injection דרך subject כנראה לא עובד מול Resend**. לכן הסיכון הממשי הוא **MEDIUM, לא CRITICAL**.
- **אבל** זו הסתמכות על התנהגות ספק שלא מובטחת בחוזה. אם יוחלף ספק / מעבר ל-SMTP / שינוי ב-Resend → הפגיעות מתממשת. התיקון זול מאוד. **לכן defense-in-depth מחייב לנקות בכל מקרה.**
- סיכונים ממשיים נוספים שכן רלוונטיים: subject מבולגן ב-`CommunicationLog` ובתצוגת ה-UI; `to` עם פסיק (recipient injection) אם אי-פעם יגיע מקלט; XSS-lite בגוף המייל ממטפל נפרץ.

---

## 4. התוכנית השכבתית (defense-in-depth) — לפי עדיפות

### 🟢 שכבה 1 — Choke Point (התיקון הקריטי, ROI הכי גבוה) — **התחל מכאן**
**קובץ יחיד: [src/lib/resend.ts](src/lib/resend.ts).** ניקוי מרכזי שמבטל את כל ~17 נקודות החשיפה בבת אחת.
- ב-`sendEmail` (לפני הקריאה ל-`resend.emails.send`, סביב שורה 62) וגם ב-`sendEmailRaw` (סביב שורה 214):
  ```ts
  import { sanitizeEmailSubject } from './email-utils';
  const safeSubject = sanitizeEmailSubject(subject).slice(0, 200);
  const safeTo = normalizedTo.replace(/[\r\n\t,;]/g, '').trim(); // חוסם גם פסיק/נקודה-פסיק (recipient injection)
  ```
  ולהשתמש ב-`safeSubject`/`safeTo` בקריאה ל-Resend.
- **להוסיף `logger.warn`** אם זוהה `\r\n` ב-subject/to **לפני** הניקוי (זיהוי ניסיון תקיפה) — בלי לרשום את הערך המלא (PHI).
- **יתרון:** לא צריך לגעת ב-17 ה-routes (cron/webhooks/register וכו') — הכל מטופל מרכזית.

### 🟡 שכבה 2 — Validation בקלט (חסימת newlines בשורש)
להוסיף `.refine(s => !/[\r\n]/.test(s), "השם מכיל תווי שורה לא חוקיים")` ל-Zod schemas של שדות שם:
- `registerSchema`, `updateProfileSchema`, `createClientSchema` (firstName/lastName/name), ושם-ארגון בהגדרות קליניקה.
- ⚠️ **דורש אימות מיקום מדויק** של ה-schemas (לא אומתו עדיין — חפש ב-`src/lib/validations/`).

### 🟡 שכבה 3 — XSS בגוף ה-HTML (escapeHtml חסר)
- [src/lib/email-templates.ts](src/lib/email-templates.ts) שורות ~97-98 (`createSessionConfirmationEmail`): `${data.therapistName}` ו-`${data.address}` בגוף **ללא** `escapeHtml` → לעטוף ב-`escapeHtml(...)`.
- [src/lib/email-templates.ts](src/lib/email-templates.ts) שורה ~226 (`createCancellationRejectedEmail`): `${data.rejectionReason}` → לעטוף ב-`escapeHtml(...)`.
- (שאר התבניות כבר משתמשות ב-escapeHtml — לאמת, לא לשנות מה שתקין.)

### 🟢 שכבה 4 — Recipient injection
מטופל ע"י שכבה 1 (ניקוי `,;` ב-`to`). בנוסף, ב-[bulk-send/route.ts](src/app/api/clients/bulk-send/route.ts) לוודא `client.email` תקין (z.string().email) לפני שליחה.

### 🟢 שכבה 5 — SMS
[src/lib/sms.ts](src/lib/sms.ts) `replacePlaceholders` (~שורה 96): לנקות גם את ה-**value** של ה-placeholder: `value.replace(/[\r\n\t]/g, ' ')`. (סיכון נמוך — plaintext, נחתך ל-201 תווים — אבל עקביות.)

### 🟡 שכבה 6 — PHI בלוגים
[src/lib/logger.ts](src/lib/logger.ts): ה-`SENSITIVE_KEY_REGEX` כנראה לא תופס `to`/`recipient`/`toNumber` → טלפונים/מיילים עלולים לדלוף ל-Render logs (למשל `sms.ts:254` רושם `{ to: phone }`). ⚠️ **דורש אימות** של ה-regex. תיקון: להוסיף `to|recipient|toNumber`, או למסך טלפון ל-4 ספרות אחרונות.

> **לא בהול / עתידי:** שדרוג `escapeHtml` לחסימת `javascript:`/`data:` ב-href ו-`on*` handlers; validation של attachments ב-Resend webhook.

---

## 5. רשימת קבצים לשינוי (סיכום)

| שכבה | קובץ | בהילות |
|---|---|---|
| 1 | `src/lib/resend.ts` (sendEmail + sendEmailRaw) | **גבוהה** |
| 3 | `src/lib/email-templates.ts` (~97-98, ~226) | בינונית |
| 5 | `src/lib/sms.ts` (~96) | נמוכה |
| 4 | `src/app/api/clients/bulk-send/route.ts` | נמוכה |
| 2 | Zod schemas (register/profile/client/org) — **אמת מיקום** | בינונית |
| 6 | `src/lib/logger.ts` (regex) — **אמת מיקום** | נמוכה |

**לא לגעת** ב-17 ה-routes שמשרשרים שם ל-subject (cron, webhooks, register, subscription-reminders, meshulam, cardcom) — שכבה 1 מטפלת בכולם.

---

## 6. בדיקות (TDD — חובה לשינוי קריטי)

קיים `src/lib/__tests__/email-utils.test.ts`. להרחיב:
1. **resend wrapper** — mock ל-Resend SDK: subject עם `'X\r\nBcc:evil@x'` מגיע נקי; `to` עם פסיק נחתך לנמען יחיד.
2. **email-templates** — `createSessionConfirmationEmail({therapistName:'<img src=x>'})` → אין `<img` גולמי ב-HTML; אותו דבר ל-rejectionReason.
3. **sms** — `replacePlaceholders('{שם}', {שם:'A\nB'})` → `'A B'`.
4. **Zod** (שכבה 2) — שם עם `\r\n` נדחה.

---

## 7. סדר ביצוע מומלץ (commit נפרד לכל שכבה — למזער התנגשות עם צ'אטים מקבילים)

1. **שכבה 1** (`resend.ts`) + הבדיקות → commit. ← זה ה-80% מהערך, בקובץ אחד בטוח.
2. **שכבה 3** (`email-templates.ts`) + בדיקות → commit.
3. **שכבה 5** (`sms.ts`) → commit.
4. **שכבה 4** (`bulk-send`) → commit.
5. **שכבה 2** (Zod) — אחרי אימות מיקום → commit (אחרון, כי נוגע בקבצים שצ'אטים אחרים עשויים לערוך).
6. **שכבה 6** (logger) — אחרי אימות → commit.

**אפשר לעצור אחרי שכבה 1+3+5** ולהשאיר 2/6 להמשך — שכבה 1 לבדה סוגרת את עיקר משטח התקיפה.

---

## 8. כללי עבודה מחייבים (חובה!)

### קוד (מ-feedback_coding_standards)
- T3 Stack, TypeScript 100% (בלי `any`).
- `export const dynamic = "force-dynamic"` בכל API route.
- **`logger`** מ-`@/lib/logger` — אף פעם לא `console.log/error` בקוד production.
- Prisma `Decimal` → תמיד `Number(value) || 0`.
- כל טקסט שהמשתמש רואה — **בעברית** (שגיאות, סטטוסים, labels).

### תהליך (מ-feedback_security_fixes + feedback_pre_push)
1. **לפני שמתחילים:** Grep רחב למיפוי כל ה-callers; קרא את ה-HANDOFF הזה.
2. **Read לפני Edit** — תמיד.
3. **TDD** — טסטים לפני/עם הקוד (שינוי קריטי: נוגע בשליחת מייל/SMS — פעולות בלתי הפיכות).
4. **שינוי אחד = commit אחד**, הודעה בעברית.
5. **git:** עבודה ישירה על `main`. **לעולם לא `git add .`** — רק שמות קבצים מפורשים (יש צ'אטים מקבילים!). לפני commit: `git diff --cached --name-only` לוודא שרק הקבצים שלך נכללים.
6. **לפני push — מחזור סוכנים עד נקי:** 5 סוכנים (3 סנכרון + עד 2 תקינות) + 2 סוכני סייבר (דליפת PHI/תקיפה + תקינות-אבטחה). הלוך-חזור עד שכולם ✅. רק אז **push אוטומטי בלי לבקש אישור**.
7. לפני commit: `npx tsc --noEmit` נקי + `npx vitest run` (רק failures שהיו לפני) + `npm run build` עובר.

### אימות (מ-feedback_thorough_review)
- בכל שינוי — לבדוק את כל הצרכנים, ה-UI, ולא רק לוגיקה.

---

## 9. מצב git נוכחי + אזהרת צ'אטים מקבילים

- ענף: `main`. הקומיט האחרון של הזימון העצמי (`cb136f7f`) כבר על `origin/main`.
- **פעילים צ'אטים מקבילים נוספים** (חווית מזכירה/מנהלת, יומן רב-מטפלים). ייתכנו קבצים לא-מנוהלים/משונים שלהם בעץ העבודה (למשל `src/components/dashboard/secretary-home.tsx`, קבצי `calendar/*`). **אל תיגע בהם, אל תקמט אותם.** קמט רק את קבצי האבטחה שלך בשמות מפורשים.
- פריסה: המערכת מריצה `prisma db push` ב-startup — אין צורך במיגרציות ידניות.

---

## 10. מה דורש אימות נוסף לפני מימוש (לא נקרא עדיין)
1. מיקום מדויק של `registerSchema` / `updateProfileSchema` / `createClientSchema` / schema שם-ארגון (שכבה 2).
2. תוכן `SENSITIVE_KEY_REGEX` ב-`src/lib/logger.ts` (שכבה 6).
3. אישור שגוף ה-HTML בכל התבניות ב-`email-templates.ts` כבר עושה escapeHtml למעט 3 המקומות שצוינו (שכבה 3).

---

## 11. Checklist לפני push
- [ ] שכבה 1 (resend.ts) מיושמת + טסט שעובר.
- [ ] `npx tsc --noEmit` → 0 שגיאות.
- [ ] `npx vitest run` → ירוק (כולל הטסטים החדשים).
- [ ] `npm run build` → עובר.
- [ ] מחזור 5+2 סוכנים → כולם ✅.
- [ ] `git add` שמות מפורשים בלבד; `git diff --cached --name-only` נבדק.
- [ ] commit בעברית + push ל-main.

**שורה תחתונה לצ'אט החדש:** התחל בשכבה 1 (`src/lib/resend.ts`) — תיקון קובץ אחד שמנקה subject+to מרכזית ומבטל את כל משטח ה-header-injection. זה הצעד הקריטי. השאר — הקשחה משלימה לפי הסדר.
