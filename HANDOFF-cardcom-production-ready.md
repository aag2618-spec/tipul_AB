# Handoff — מעבר Cardcom מ-sandbox לטרמינל אמיתי בפרודקשן

> **לצ'אט הבא:** קרא את כל המסמך הזה לפני שאתה עושה משהו. הכל מתועד כאן.

---

## הקשר — מי המשתמש ומה המצב

**משתמש:** אברהם גשייד (aag2618@gmail.com). מטפל, **לא מתכנת**. עברית בלבד.

- USER ID שלו: `cmjsd941a00002fps7lcook18`
- role: USER + OWNER של הקליניקה היחידה
- אתר פרודקשן: `https://mytipul.com`
- אתר staging: `https://tipul-mh2t.onrender.com`
- מתארח על **Render.com** (לא Vercel)

**מצב נוכחי:** הפרויקט עובד. שילם ב-Cardcom sandbox ENTERPRISE, התשלום אושר אחרי תיקון בעיית Int→String + לחיצה על כפתור "סנכרן מ-Cardcom" שהוספנו.

---

## מה תוקן בצ'אט הזה (3 commits ב-main)

### commit `bebdb7b` — `diag(admin)` — תצוגת אבחנה
- כרטיס "אבחנת מנוי (לצורכי debug)" צהבהב ב-`/admin/users/[id]` שמציג: `aiTier`, `pendingTier`, `pendingTierEffectiveAt`, `subscriptionStatus`, `subscriptionStartedAt/EndsAt`, `trialEndsAt`.
- שורת "תקופה: ... — ..." לכל SP ב-SubscriptionAdminCard.

### commit `4a0cdcc` — `feat(admin)` — כפתור "סנכרן מ-Cardcom"
- endpoint חדש: `POST /api/admin/cardcom-transactions/[id]/sync-cardcom`
- אסטרטגיה: **self-call** ל-`/api/webhooks/cardcom/admin` עם `{LowProfileId, Timestamp}`. ה-webhook עושה GetLpResult ומחיל. 0 קוד כפול.
- ADMIN בלבד + `actingAs` חסום.
- guards: tenant=ADMIN, lowProfileId קיים, status לא טרמינלי (APPROVED/REFUNDED/CANCELLED).
- כפתור ב-SubscriptionAdminCard מוצג רק כש-SP=PENDING + cardcomTransaction עם lowProfileId קיים + status!=APPROVED.
- financial endpoint הורחב: `cardcomTransactions` כולל כל הסטטוסים (לא רק APPROVED). הוסף `lowProfileId` ל-select+serialization (זה היה blocker שתפסו הסוכנים).

### commit `4408142` — `fix(cardcom)` — נירמול Int→String ב-admin webhook
**זה היה הבאג העיקרי:** Cardcom sandbox (ולפעמים prod) מחזיר `TranzactionId` (Int 248402990) ו-`Last4CardDigits` (Int 8) למרות שה-OpenAPI מתעד אותם כ-String. Prisma schema אצלנו מצפה ל-String → exception:
```
Argument `transactionId`: Invalid value provided. Expected String ... provided Int.
```
**תוצאה היסטורית:** הכסף נגבה ב-Cardcom, קבלה הוצאה, אבל ה-SP נשאר PENDING ו-aiTier לא מתעדכן. גם אם webhook אמיתי היה מגיע — היה נופל באותה דרך.

**התיקון:** helper `normalizeCardcomPayload` ב-`src/lib/cardcom/verify-webhook.ts`. ממיר TranzactionId/Last4CardDigits/ApprovalNumber ל-String. Last4 מעדיף `Last4CardDigitsString` (Cardcom נותנת אותו padded "0008") ואחרת `padStart(4,"0")`. שימוש יחיד ב-admin webhook אחרי `getLpResult`.

### commit `a346381` — `fix(cardcom)` — הרחבת הנירמול
הוספת אותו `normalizeCardcomPayload` גם ב:
- `src/app/api/webhooks/cardcom/user/route.ts` (webhook לתשלומי מטופלים)
- `src/lib/cardcom/sync-cardcom-payment.ts` (sync ידני של תשלומים רגילים)

עכשיו **3/3 callers** של `getLpResult` מנרמלים: admin webhook, user webhook, sync-cardcom-payment.

---

## משימה לצ'אט הבא: הכנה לטרמינל Cardcom אמיתי

המשתמש כרגע ב-sandbox terminal ("חברה לבדיקה בע"מ - מסוף טסטים", terminal 1000 בערך). הוא רוצה לעבור לטרמינל אמיתי וצריך לוודא שהכל יעבוד.

### Checklist ל-Production (שאלות לשאול את המשתמש)

#### 1. Render Environment Variables — בדיקה ראשונית
המשתמש צריך לוודא ב-Render Dashboard (השירות של `mytipul.com`, לא tipul-mh2t):
- [ ] `NEXT_PUBLIC_BASE_URL=https://mytipul.com` (לא tipul-mh2t)
- [ ] `NEXTAUTH_URL=https://mytipul.com`
- [ ] `CARDCOM_USERNAME=...` (של הטרמינל החדש, לא sandbox)
- [ ] `CARDCOM_TERMINAL_NUMBER=...` (החדש)
- [ ] `CARDCOM_API_KEY=...` (החדש)
- [ ] `CARDCOM_WEBHOOK_IP_ALLOWLIST=...` — **קריטי!** רשימת IPs של Cardcom (לבקש מהם). אם ריק בפרודקשן, הקוד דוחה כל webhook (fail closed).

#### 2. Cardcom Backend — הגדרות הטרמינל החדש
בקש מהמשתמש להיכנס ל-Cardcom Backend עם הטרמינל האמיתי ולבדוק:
- [ ] **WebHook URL ברמת הטרמינל** מוגדר ל-`https://mytipul.com/api/webhooks/cardcom/admin` (לא tipul-mh2t!)
- [ ] **IndicatorUrl** נשלח פר-עסקה אוטומטית ע"י הקוד שלנו — לוודא שזה תואם

#### 3. בדיקת תשלום ראשונה בפרודקשן
- [ ] תשלום קטן (חודשי ESSENTIAL, ~117₪) — לעצמו או דרך משתמש בדיקה
- [ ] **לבדוק ש-webhook הגיע אוטומטית** — אם כן ✅, אם לא — להשתמש בכפתור "סנכרן מ-Cardcom"
- [ ] לוודא ב-DB ש-`User.aiTier = ESSENTIAL`, `subscriptionStatus=ACTIVE`, `subscriptionStartedAt` ו-`subscriptionEndsAt` מתמלאים נכון

---

## דברים שעדיין לא טופלו (אופציונלי לעתיד)

### A. התראה אוטומטית על webhook שלא הגיע
היום ה-cron `cardcom-cleanup-pending` רץ פעם ביום ומסמן SP > 24h ב-PENDING כ-EXPIRED. אבל **אין התראה לאדמין שמשהו תקוע**. כדאי להוסיף:
- Cron כל שעה שבודק SPs ב-PENDING > 15 דקות עם lowProfileId
- אם נמצא → AdminAlert (URGENT) עם הצעה "לחץ כאן לסנכרן"
- אפשר גם לעשות auto-sync (קריאה לendpoint שכבר קיים)

קובץ קיים שיכול להיות בסיס: `src/app/api/cron/cardcom-cleanup-pending/route.ts`

### B. user webhook — לא נבדק בפרודקשן עדיין
תיקון Int→String מותקן (commit a346381), אבל אין משתמשים פעילים שמשלמים דרך user webhook (תשלומי מטפל-למטופל). כשיהיו — לבדוק שזה עובד מקצה לקצה.

### C. עדכון Render env var אם יש סביבות מרובות
אם המשתמש מקיים גם `tipul-mh2t.onrender.com` (staging) וגם `mytipul.com` (prod), כדאי לוודא ששתיהן עם env vars נפרדים. כרגע יכול להיות שהן חולקות DATABASE_URL → השכל אומר שלא.

---

## נתונים טכניים שצריך לדעת

### מבנה Cardcom webhook (תיעוד פנימי)

```typescript
// בקצרה — מה Cardcom מחזירה ב-GetLpResult (לפי הלוגים):
{
  ResponseCode: 0,
  LowProfileId: "uuid",
  TranzactionId: 248402990,  // Int! צריך String — מנורמל אוטומטית
  TranzactionInfo: {
    ApprovalNumber: "12345",
    Last4CardDigits: 8,  // Int! צריך String "0008" — מנורמל אוטומטית
    Last4CardDigitsString: "0008",  // Cardcom מספקת זאת בנפרד (נעדיף)
    CardName: "ויזה זהב",
    CardExpirationMM: 10,
    CardExpirationYY: 28,
    Token: "uuid-לחיוב-חוזר",
    ...
  },
  DocumentInfo: { DocumentNumber: 23431, DocumentUrl: "...", ... },
  Operation: "ChargeAndCreateToken" | "CreateTokenOnly" | "ChargeOnly",
  ...
}
```

### זרימה תקינה של תשלום מנוי

1. POST `/api/subscription/create` → יוצר SubscriptionPayment (PENDING) + CardcomTransaction (PENDING)
2. קוראים ל-Cardcom `createPaymentPage` עם `webhookUrl` ו-`createToken: true`
3. המשתמש משלם ב-iframe של Cardcom
4. **Cardcom שולחת POST ל-`webhookUrl`** = `/api/webhooks/cardcom/admin`
5. ה-webhook עושה:
   - `getLpResult(LowProfileId)` → תוצאה אמיתית
   - `normalizeCardcomPayload` → המרת Int ל-String
   - `claimWebhook` → idempotency
   - בתוך `withAudit` Serializable transaction:
     - `cardcomTransaction.update` → status=APPROVED, token, last4
     - `subscriptionPayment.update` → status=PAID, paidAt, chargeAttempts=0
     - `user.update` → subscriptionStatus=ACTIVE, aiTier, subscriptionStartedAt/EndsAt
     - `savedCardToken.create` (לחיוב חוזר חודשי)
     - `cardcomInvoice.create` (קבלה ב-DB)

### כפתור "סנכרן מ-Cardcom" — איך עובד

- מוצג ב-`/admin/users/[id]` תחת "תשלומי מנוי" על SP במצב PENDING
- ADMIN בלבד
- קריאה ל-`POST /api/admin/cardcom-transactions/[id]/sync-cardcom`
- ה-endpoint עושה **self-call** ל-`/api/webhooks/cardcom/admin` עם `{LowProfileId, Timestamp}`
- ה-webhook מבצע את הזרימה הרגילה (אותה הגנת idempotency וכו')
- אם הצליח: ההודעה "הסנכרון הצליח — העסקה אושרה ועודכנה"
- אם Cardcom עדיין PENDING: "Cardcom עוד לא מאשר את העסקה. אם שילמת בפועל — נסה שוב בעוד מספר דקות."

---

## הוראות עבודה למשתמש (כללי)

מועתקות מהזיכרון של הצ'אט:

1. **כל התקשורת בעברית** — תוכניות, הסברים, הודעות.
2. **לא git add .** — יש צ'אטים מקבילים על אותה עץ עבודה. תמיד `git add <שמות מפורשים>`.
3. **לפני push:** 3 סוכני ביקורת מקבילים. רק אחרי שכולם אישרו.
4. **שינויים קריטיים (כסף!):** TDD + סוכן ביקורת לפני הטמעה.
5. **T3 Stack:** Next.js App Router, TypeScript 100%, Prisma. `force-dynamic` לכל API. `requireAuth` ל-API. `logger` ולא `console.log`.
6. **Decimal של Prisma:** `Number(value) || 0` בכל מקום.
7. **Date null safety:** `date ? format(new Date(date), ...) : "לא צוין"`.
8. **המשתמש הוא USER + OWNER** (לא ADMIN). אבל יש לו גישת ADMIN לפעולות מסוימות דרך הקליניקה שלו.
9. **האתר לקהל חרדי** — לא זוגיות, התאמת שפה ותוכן.
10. **המשתמש לא מתכנת** — הסברים פשוטים, כמו לכיתה ה'.

### צ'אט אבטחה מקביל פעיל!
יש צ'אט אחר שעובד על תיקוני אבטחה (M13.x). הוא נוגע ב:
- `src/app/api/transcribe/route.ts`
- `src/app/api/uploads/[...path]/route.ts`
- `next.config.ts`
- `src/lib/rate-limit.ts`
- `src/app/api/csp-report/` (חדש)
- `src/app/api/admin/users/route.ts`

**אל תיגע בקבצים הללו** אלא אם נדרש במפורש. השתמש ב-`git status` לפני כל commit לראות מה לא שלך.

---

## תזכיר — איך לפתוח צ'אט חדש

נקודת התחלה למשתמש:

> "קרא את `HANDOFF-cardcom-production-ready.md` בשורש הפרויקט. אני רוצה לעבור לטרמינל Cardcom אמיתי — תעבור איתי על ה-Checklist בסוף המסמך ותעזור לי לוודא שהכל מוכן."

או:

> "קרא את `HANDOFF-cardcom-production-ready.md`. תוסיף התראת אדמין אוטומטית אם webhook לא הגיע תוך 15 דקות (סעיף A במשימות לעתיד)."

---

## קבצים שעודכנו בצ'אט הזה (לפי commits)

```
bebdb7b: src/app/admin/users/[id]/page.tsx
         src/app/api/admin/users/[id]/route.ts
         src/components/admin/subscription-admin-card.tsx

4a0cdcc: src/app/api/admin/cardcom-transactions/[id]/sync-cardcom/route.ts (NEW)
         src/app/api/admin/users/[id]/financial/route.ts
         src/components/admin/subscription-admin-card.tsx

4408142: src/app/api/webhooks/cardcom/admin/route.ts
         src/lib/cardcom/types.ts
         src/lib/cardcom/verify-webhook.ts (added normalizeCardcomPayload)

a346381: src/app/api/webhooks/cardcom/user/route.ts
         src/lib/cardcom/sync-cardcom-payment.ts
         src/lib/cardcom/verify-webhook.ts (generic relaxed)
```

---

**סוף המסמך. בהצלחה!**
