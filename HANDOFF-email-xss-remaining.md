# HANDOFF — השלמת הקשחת XSS במיילי תשלום (MyTipul)

> ## ✅ הושלם ונדחף ל-`main` — 2026-06-12 (commits `34e797b2`..`d5c793da`)
> כל 3 המשימות בוצעו: **A** (escapeHtml ל-message/userName/userEmail ב-`createAdminPaymentHtml`), **B** (safeHttpUrl על logoUrl/paymentLink ב-payment-history, send-debt-reminder, cron/debt-reminders), **C** (איחוד safeHttpUrl ל-`email-utils.ts` + הסרת 3 ההעתקים המשוכפלים כולל ה-inline ב-cardcom).
> אומת: `tsc` נקי, `eslint` 0 errors, `vitest` 877 עוברות, `next build` exit 0, 3 סוכני ביקורת (סייבר/תקינות/שלמות) — אין חוסם.
> שינויי ה-cron בודדו משינויי ה-logger של הצ'אט המקביל (commit `bbf58598` נקי). **אין צורך לבצע שוב.** (המשך המסמך נשמר כתיעוד היסטורי.)

---

> **מסמך העברה לצ'אט חדש. קרא במלואו לפני שאתה נוגע בקוד.**
> נכתב 2026-06-12 בסוף צ'אט שתיקן *יישור תצוגה* במיילי תשלום, ותוך כדי גילה והקשיח חלק מבעיות XSS באותם קבצים. זהו המשך ישיר ל-`HANDOFF-email-security.md` (מומלץ לקרוא גם אותו).
> **המטרה:** לסגור את **שאריות ה-XSS בגוף ה-HTML של המיילים**, ברמת defense-in-depth, בלי לשבור שום מייל קיים.

---

## 0. מי המשתמש ואיך עובדים (חובה!)
- המשתמש הוא **מטפל, לא מתכנת** → הסברים ב**עברית פשוטה וברורה**, בלשון זכר (אתה/שלך). לא לערבב אנגלית באמצע משפט עברי (משבש כיוון). מונחים טכניים/שמות קבצים — ב-backticks.
- כל קבצי הכללים נטענים דרך `MEMORY.md` (תיקיית הזיכרון) — **חובה לפעול לפיהם.** הכי רלוונטיים כאן:
  - `feedback_security_fixes` — כללי תיקוני אבטחה (מיפוי לפני התחלה, סדר checks, לולאת סוכנים).
  - `feedback_pre_push` — תהליך הסוכנים לפני push.
  - `feedback_parallel_chats` — **יש צ'אטים מקבילים פעילים. לעולם לא `git add .` — רק שמות קבצים מפורשים.**
  - `feedback_coding_standards` — T3 Stack, force-dynamic, `logger`, Prisma Decimal, escapeHtml.
  - `reference_email_html_layout` — מיילים: אסור `display:flex`/הזחה ב-`pre-wrap`.
- עבודה ישירה על `main`. commit בעברית + שורת `Co-Authored-By: Claude...`.

---

## 1. הרקע — מהי הבעיה (XSS בגוף מייל)
תבניות המייל בונות HTML ע"י הדבקת מחרוזות (`` `...${value}...` ``). אם `value` מקורו ב**משתמש / DB / webhook** ולא עבר סינון — אפשר להזריק HTML/JS למייל (XSS). שתי הגנות, לפי ההקשר:

| הקשר | הגנה | דוגמה |
|---|---|---|
| טקסט בגוף HTML | `escapeHtml(value)` | `<h2>שלום ${escapeHtml(name)}</h2>` |
| כתובת ב-`href` / `src` | `safeHttpUrl(value)` (חוסם `javascript:`/`data:`) **ואז** `escapeHtml` | ראה תבנית בסעיף 4 |

שני ה-helpers:
- `escapeHtml` — קיים ב-`src/lib/email-utils.ts` (מיובא ברוב הקבצים).
- `safeHttpUrl` — קיים כרגע **מקומית** ב-`src/lib/email-templates/payment-receipt.ts` וב-`src/app/api/webhooks/meshulam/route.ts` (ראה משימה C — כדאי לאחד).

---

## 2. מה כבר תוקן ונדחף ל-`main` — ❌ אל תחזור על זה
| Commit | קובץ | מה תוקן |
|---|---|---|
| `920d9a7c` | `src/lib/email-templates/payment-receipt.ts` | `receiptNumber` → `escapeHtml`; `receiptUrl` ב-href → `safeHttpUrl` + `escapeHtml` |
| `a9f0c331` | `src/app/api/webhooks/meshulam/route.ts` → `createSubscriptionConfirmHtml` | `receiptUrl` (מ-`documentUrl` של webhook, **קלט חיצוני**) ב-href → `safeHttpUrl` + `escapeHtml`; `name` בברכה → `escapeHtml` |

> בנוסף, `payment-receipt.ts` כבר מכיל הגנת `safeHttpUrl` על `paymentLink` (מסומן `M-XSS-1`) — **השתמש בו כתבנית-מופת.**

---

## 3. מה נשאר לעשות (מפורט — מיקום + קוד פגיע + תיקון)

> ⚠️ מספרי השורות עשויים לזוז אם קבצים נערכים. תאתר לפי שם הפונקציה / קטע הקוד, לא רק לפי המספר.

### 🟡 משימה A — מייל התראה למנהל (`createAdminPaymentHtml`)
**קובץ:** `src/app/api/webhooks/meshulam/route.ts` (~שורה 1299).
**סיכון:** בינוני-נמוך. המייל נשלח **רק ל-ADMIN_EMAIL** (לא ללקוחות), אבל הערכים `message`, `userName`, `userEmail` מקורם ב-DB (שם/מייל של משתמש) ומוזרקים **גולמית** → XSS מאוחסן שמכוון למנהל (יעד בעל ערך).

הקוד הפגיע (~שורות 1322, 1325, 1326):
```ts
<p style="margin: 0; font-size: 15px; color: #1e293b;">${message}</p>
...
<tr><td ...>שם:</td><td ...><strong>${userName}</strong></td></tr>
<tr><td ...>מייל:</td><td ...>${userEmail}</td></tr>
```
**התיקון:** לעטוף את שלושתם:
```ts
<p style="...">${escapeHtml(message)}</p>
...
<strong>${escapeHtml(userName)}</strong>
...
<td ...>${escapeHtml(userEmail)}</td>
```
(`escapeHtml` כבר מיובא בקובץ. `planName`/`amount`/`SYSTEM_URL` באותה פונקציה — בטוחים, לא לגעת.)

### 🟡 משימה B — כתובות URL גולמיות ב-`href`/`src` ב-4 תבניות
**סיכון:** בינוני. `paymentLink`/`logoUrl` הם owner-controlled (המטפל מגדיר אותם בהגדרות התקשורת) — מטפל שחשבונו נפרץ יכול להזריק `javascript:`/`data:`. כולם מוזרקים גולמית ל-href/src בלי `safeHttpUrl`.

| קובץ | ~שורה | הקוד הפגיע |
|---|---|---|
| `src/lib/email-templates/payment-history.ts` | 108 | `<img src="${customization.logoUrl}" ... />` |
| `src/lib/email-templates/payment-history.ts` | 154 | `<a href="${customization.paymentLink}" ...>` |
| `src/app/api/clients/[id]/send-debt-reminder/route.ts` | 129 | `<a href="${customization.paymentLink}" ...>` |
| `src/app/api/cron/debt-reminders/route.ts` | 121 | `<a href="${customization.paymentLink}" ...>` |

**התיקון (לכל מופע):** להעביר את הכתובת דרך `safeHttpUrl`, ואם לא תקין — להסתיר את האלמנט. בדיוק כמו ההגנה הקיימת על `paymentLink` ב-`payment-receipt.ts`. דוגמה ל-href:
```ts
${(() => {
  const safeLink = safeHttpUrl(customization?.paymentLink ?? null);
  if (!safeLink) return "";
  return `<a href="${escapeHtml(safeLink)}" style="...">שלם עכשיו בקליק</a>`;
})()}
```
ל-`logoUrl` (img src) — אותו רעיון; `javascript:` לא רץ ב-`src` של img, אבל `safeHttpUrl` חוסם `data:`/scheme לא תקין ושומר עקביות.

### 🟢 משימה C — איחוד `safeHttpUrl` (cleanup)
כרגע `safeHttpUrl` **משוכפל**: ב-`payment-receipt.ts`, ב-`meshulam/route.ts`, וגרסת-inline (`new URL`) ב-`src/app/api/webhooks/cardcom/admin/route.ts`. בנוסף יש גרסה **browser-only** (תלוית `window`) ב-`receipt-utils.ts` — **לא** מתאימה לשרת.
**מומלץ:** להוסיף `safeHttpUrl` מיוצא ל-`src/lib/email-utils.ts` (לצד `escapeHtml`/`safeEmailSubject`), ולייבא בכל המקומות במקום הכפילויות. ⚠️ `email-utils.ts` הוא קובץ של צ'אט האבטחה — אם הוא בעבודה במקביל, תאם או בצע אחרון.

---

## 4. ה-helper הקנוני (העתק מדויק מ-`payment-receipt.ts`)
```ts
// M-XSS-1: ולידציית URL ב-render time. חוסם scheme לא בטוח (javascript:/data:/file:)
// בכתובות שמגיעות מ-DB/webhook/הגדרות לפני הזרקה ל-href/src.
function safeHttpUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  if (input.length > 2000) return null;
  try {
    const u = new URL(input);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
```

---

## 5. סדר ביצוע מומלץ (commit נפרד לכל משימה — למזער התנגשות)
1. **משימה A** (`meshulam/route.ts`, `createAdminPaymentHtml`) → commit. *(קובץ webhook קריטי — לגעת רק בקוד יצירת ה-HTML, לא בלוגיקת התשלום.)*
2. **משימה B** (4 התבניות) → commit (אפשר אחד או לפי קובץ).
3. **משימה C** (איחוד `safeHttpUrl`) → commit אחרון (נוגע ב-`email-utils.ts` — אולי תחום צ'אט האבטחה).

---

## 6. בדיקות לפני push (לפי `feedback_pre_push`)
- `npx tsc --noEmit` → 0 שגיאות.
- `npx eslint <הקבצים ששינית>` → נקי (אזהרות ישנות על `safeTherapist`/`session` לא קשורות).
- `npx vitest run` → ירוק (רק failures שהיו לפני). *(הטסט `exempt-internal-receipt.test.ts` עושה mock לתבניות — לא נשבר משינויי markup.)*
- **לולאת סוכני ביקורת** עד נקי: ביקורת אבטחה/PHI + תקינות/רגרסיה. ודא לכל ערך: escaping לא הופחת, URLs תקינים עדיין נפתחים, אין escaping כפול.
- ואז **push אוטומטי ל-`main` בלי לבקש אישור**.

---

## 7. אזהרת צ'אטים מקבילים (קריטי)
בעת כתיבת המסמך, בעץ העבודה היו שינויים **לא מנוהלים של צ'אטים אחרים** (אבטחת PHI ב-logs, חווית מזכירה/מנהלת ועוד) בקבצים כמו `src/lib/logger.ts`, `src/app/api/cron/debt-reminders/route.ts` (חלק ה-logger בלבד!), `src/app/api/sessions/route.ts`, `src/app/api/admin/users/[id]/route.ts` ועוד.
- **אל תיגע בשינויים שאינם שלך.** אם קובץ שאתה צריך לערוך מכיל גם שינויים של אחר (כמו `debt-reminders/route.ts` שמכיל גם שינויי logger של צ'אט אחר) — ערוך **רק את האזור שלך**, ובעת ה-commit ודא ב-`git diff --cached` שלא נכנסו שינויים זרים. אם צריך — בודד את ה-hunk שלך (גיבוי הקובץ → `git checkout HEAD -- <file>` → יישום מחדש של השינוי שלך בלבד → commit → שחזור הגיבוי).
- `git diff --cached --name-only` לפני **כל** commit.

**שורה תחתונה:** התחל ממשימה A (מייל המנהל). השתמש ב-helper מסעיף 4 וב-`escapeHtml`. שלוש המשימות סוגרות את שאריות ה-XSS בגוף המיילים.
