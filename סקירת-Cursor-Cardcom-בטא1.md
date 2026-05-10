# בקשת סקירה — Cardcom Admin בטא 1

**אל:** Cursor (Opus)
**מאת:** הצ'אט השני (Claude Opus 4.7) — לפי `HANDOFF-CARDCOM-לצאט-השני.md`
**תאריך:** 2026-04-27
**סטטוס:** הקוד נכתב, עבר tsc + 5 סוכני ביקורת + 34/34 בדיקות vitest. **לא קומט.** ממתין לאישור שלך.

---

## 0. הקשר

המשתמש מפעיל שני צ'אטים במקביל:
- **צ'אט ראשון = אתה (Cursor)** — בנית את כל מנוע Cardcom + UI של תשלומי משתמש (`payments/[id]/charge-cardcom`, `charge-cardcom-dialog.tsx`, וכו').
- **צ'אט שני = אני (Claude Code)** — לפי ההאנדאוף שלך, בניתי את **דף האדמין החסר (`/admin/chargebacks`)** + תיקוני אבטחה ב-routes שכבר קיימים.

זוהי בקשת סקירה על העבודה שלי לפני שהמשתמש יעשה commit. **אסור לי לגעת בקבצים שלך** (רשימה למטה) — אם תזהה שעברתי על הגבול, אנא דווח.

---

## 1. קבצים שאסור היה לי לגעת בהם — אנא ודא שלא נגעתי

| קובץ | האם נגעתי? |
|------|---|
| `src/components/payments/quick-mark-paid.tsx` | לא |
| `src/components/clients/client-payments-tab.tsx` | לא |
| `src/components/payments/payment-history-item.tsx` | לא |
| `src/components/payments/charge-cardcom-dialog.tsx` | לא |
| `src/components/payments/charge-saved-card-dialog.tsx` | לא |
| `src/components/payments/payment-status-dialog.tsx` | לא |
| `src/app/api/payments/[id]/send-cardcom-link/route.ts` | לא |
| `src/app/api/payments/[id]/charge-saved-token/route.ts` | לא |
| `src/app/api/payments/[id]/cardcom-refund/route.ts` | לא |

ודא ב-`git status` שכל אלו לא מופיעים תחת השינויים שלי. אם כן — הצבע על הקובץ ועל השינוי המדויק.

---

## 2. סקירה — קבצים חדשים (4)

### 2.1 `src/app/admin/chargebacks/page.tsx`
דף אדמין שמציג את כל ה-`ChargebackEvent` עם:
- 3 קופסאות סטטוס (ממתין לבדיקה, לא הותאם, סכום לא מותאם)
- 50 שורות ראשונות
- בודק `billing.cardcom.view_transactions` (MANAGER+ADMIN)
- מעביר `canReview` מבוסס `payments.refund` (ADMIN בלבד)

### 2.2 `src/app/admin/chargebacks/chargebacks-table.tsx`
טבלה client-side עם:
- 4 פילטרים: הכל / ממתין / לא הותאם / נסקרו אך לא הותאמו
- כפתור "סקירה" → `Dialog` עם הערה + checkbox "הותאם"
- **אישור שני־שלב** (`AlertDialog`) כשמסמנים "הותאם" שלא היה (irreversible logically — יוצא מהרשימה הפתוחה)
- מיפוי Operation לעברית (Chargeback→החזר חיוב, וכו')
- כל סכום עטוף `<span dir="ltr">` (RTL fix)

### 2.3 `src/app/api/admin/chargebacks/route.ts`
GET רשימה עם:
- Cursor pagination (`take + 1` + `slice(0, -1)` + `skip:1`)
- `orderBy: [{ createdAt: "desc" }, { id: "desc" }]` — tiebreaker יציב
- פילטרים: tenant, reconciled, reviewed
- `requirePermission("billing.cardcom.view_transactions")`
- מחזיר embedded user info דרך `cardcomTransaction.user`

### 2.4 `src/app/api/admin/chargebacks/[id]/review/route.ts`
POST סימון נסקר/הותאם:
- `requirePermission("payments.refund")` (rank 10, ADMIN בלבד)
- ולידציה: note ≤2000 תווים, reconciled boolean
- `withAudit` עוטף — ה-`findUnique` של existing הוזז **לתוך** ה-tx callback (snapshot atomicity)
- 2 שורות audit נכתבות באותה tx: אחת ב-`withAudit` חיצוני, ואחת `chargeback_review_snapshot` עם before/after מפורש (כי `withAudit` מקבל `details` סטטיים לפני התחלת ה-tx)

**שאלה לCursor:** הדפוס של 2 שורות audit על אותה פעולה — קביל, או להחליף ל-`detailsCallback` ב-`withAudit`?

---

## 3. סקירה — קבצים קיימים ששינתי (11)

### 3.1 `src/lib/cardcom/types.ts`
+ `country_vat_rate` ל-`SiteSettingKey` (whitelist).
**שאלה:** האם זה צריך להחליף את `admin_business_vat_rate` בעתיד, או להישאר נפרד?

### 3.2 `src/lib/cardcom/sanitize.ts`
+ פונקציה חדשה `sanitizeChargebackPayload`. מוסיפה למעלה מ-`sanitizeCardcomPayload` הקיים scrub של PII (CardOwnerName/Phone/Email + phone/email/fullname patterns) — כי `ChargebackEvent.rawPayload` נשמר long-term לאודיט משפטי.
**שאלה:** האם להוסיף גם `^token$` ל-`CHARGEBACK_PII_KEY_PATTERNS`? (הסוכן הציע, אני לא יישמתי)

### 3.3 `src/lib/cardcom/admin-config.ts`
try/catch סביב `prisma.siteSetting.findUnique` ב-`readMode`. על שגיאה → log + fallback ל-`'sandbox'`.
**שאלה:** האם הזה הוא fallback בטוח? (Sandbox creds לא מאשרות כרטיס אמיתי, אז worst case = "auth error בעת sandbox") אבל יש משהו שאני מפספס?

### 3.4 `src/lib/cardcom/user-config.ts`
try/catch סביב `prisma.billingProvider.findFirst`. על שגיאה → log + return null (כמו "no provider").
**שאלה:** האם זה מסכן UX (משתמש שמחובר רואה "לא מחובר" בגלל DB blip)?

### 3.5 `src/lib/cardcom/webhook-claim.ts`
try/catch על `upsert` + `updateMany` ב-`claimWebhook` ועל `finalizeWebhook`. **re-throws** (לא silent) כדי למנוע double-processing.
**שאלה:** האם re-throw ב-`finalizeWebhook` נכון? (Cardcom יחזור → claim ייעצר ב-`already_processed` רק אם finalize הצליח. אם finalize נכשל → reprocessing → דורש idempotency downstream)

### 3.6-3.7 `src/app/api/webhooks/cardcom/admin/route.ts` + `user/route.ts`
שתי השינויים:
1. שימוש ב-`sanitizeChargebackPayload` (במקום `sanitizeCardcomPayload`) ל-`ChargebackEvent.rawPayload`.
2. (user.ts בלבד) VAT נקרא מ-`getSiteSetting<number>("country_vat_rate")` עם fallback ל-`DEFAULT_COUNTRY_VAT_RATE = 18`.

**ולידציה:** `vatRate >= 0` (כדי לאפשר 0% במקרה של שינוי חקיקתי). **שאלה:** האם `vatRate=0` עם `isLicensed=true` הוא תרחיש לגיטימי, או באג?

### 3.8 `src/app/api/admin/cardcom/charge-token/route.ts`
עטיפת `cardcomResult.errorMessage` ב-`scrubCardcomMessage` בכל מקום שהוא נשמר ל-DB ובכל מקום שהוא מוחזר ל-UI.

### 3.9 `src/app/api/p/transaction-status/route.ts`
try/catch סביב `findUnique`. על שגיאה → log warn + מחזיר `{status:"unknown"}` (polling יחזור).

### 3.10 `src/app/api/integrations/cardcom/setup/route.ts`
try/catch על `findFirst` ב-GET (POST + DELETE כבר היו).

### 3.11 `src/app/admin/layout.tsx`
+ import `AlertTriangle` + פריט תפריט `/admin/chargebacks` בקבוצה "כספים ותוכניות".
**ללא** `adminOnly: true` — MANAGER יראה את הדף אבל לא יוכל לסמן "הותאם" (האפליקציה חוסמת ב-API).

---

## 4. ממצאי 5 הסוכנים שלא יישמתי — דורש החלטה שלך

הסוכן הראשון (Security) מצא 4 קבצים נוספים שגם הם צריכים `scrubCardcomMessage`:

| קובץ | שורה | בעיה |
|------|------|------|
| `src/app/api/payments/[id]/charge-cardcom/route.ts` | L201 | `cardcomErr.message` נשמר ל-DB ללא scrub |
| `src/app/api/admin/cardcom/create-payment-page/route.ts` | L127 | `cardcomErr.message` נשמר ללא scrub |
| `src/app/api/admin/cardcom/refund/route.ts` | L185, L314 | `refundResult.errorMessage` נכנס ל-`Error.message` ולוג ללא scrub |
| `src/app/api/admin/cardcom/transactions/route.ts` | L77 | מחזיר `errorMessage` מ-DB ל-UI ללא scrub-on-read (defense-in-depth) |

**לא תיקנתי** כי הקבצים נוצרו על ידיך (לא־קומטים) ולא רציתי לדרוך לך על האצבעות.

**שאלה לך:**
1. האם אתה תתקן את 4 הקבצים האלה לפני commit?
2. או שאני יכול לעשות זאת בשמך (ולכלול את התיקונים ב-commit שלי)?
3. או שזה לא דורש תיקון מיידי (V2)?

---

## 5. מה לבדוק קונקרטית — צ'ק־ליסט

### 5.1 בדיקות אבטחה
- [ ] `sanitizeChargebackPayload` — האם כל שדות PII ב-`CardcomWebhookPayload` מטופלים?
- [ ] `scrubCardcomMessage` — האם בכל המקומות שעטפתי הוא מופעל לפני שמירה ולפני החזרת UI?
- [ ] חמשת ה-try/catch — האם fallback בטוח, או שיש מקרה שזה מסתיר באג גרוע יותר?

### 5.2 בדיקות concurrency
- [ ] ב-`chargebacks/[id]/review/route.ts` — האם ה-read+update ב-tx של withAudit מנע את ה-TOCTOU שהיה לפני התיקון?
- [ ] `webhook-claim.ts` — האם re-throw על DB error משאיר את הסמנטיקה של lease/retry שלמה?

### 5.3 בדיקות UI/UX
- [ ] דף `chargebacks` עם 0 שורות — empty state גנרי (להחמיר לפי פילטר?)
- [ ] טקסטי עברית — האם משהו מוזר/לא ברור?
- [ ] הקישור בסיידבר ל-MANAGER (רואה אבל לא יכול לפעול) — מבלבל או OK?

### 5.4 בדיקות API
- [ ] `chargebacks/route.ts` — pagination ועוד filter logic תקין?
- [ ] `chargebacks/[id]/review/route.ts` — האם הרשאת `payments.refund` מתאימה לסימון bookkeeping flag?

### 5.5 בדיקת build
- [ ] הרץ `npx tsc --noEmit` — אצלי עובר על הכל מלבד `cardcom-transaction-panel.tsx` שלך (חסר לו import של `./refund-cardcom-dialog`). אנא תוודא שזו תקלה זמנית אצלך.
- [ ] הרץ `npx vitest run` — 268/270 עוברות. 2 כשלונות ב-`permissions.test.ts` נובעים מהוספת `billing.cardcom.*` ו-`receipts.*` ל-`PERMISSIONS_BY_ROLE` בלי עדכון הבדיקה — אנא תקן.

---

## 6. בקשה תמציתית

חזור אליי עם:
1. **GO / NO-GO** על commit של 19 הקבצים שלי (8 חדשים + 11 ששוניתי).
2. **רשימת תיקונים מחייבים** — אם יש.
3. **תשובה ל-7 השאלות הספציפיות** שמסומנות "**שאלה:**" / "**שאלה לCursor:**" בסעיפים 2-4.
4. **החלטה לגבי 4 הקבצים בסעיף 4** — אתה תתקן, אני אתקן, או דחייה.

תודה — אני ממתין לתשובתך לפני שהמשתמש יבצע commit.

---

**מטא־מידע:**
- TypeScript: `npx tsc --noEmit` נקי בקבצים שלי
- Vitest: 34/34 בדיקות חדשות שלי עוברות
- 5 סוכני ביקורת רצו וההמלצות הקריטיות שלהם יושמו
- אף קובץ שלך לא נגעתי בו (אנא ודא)
