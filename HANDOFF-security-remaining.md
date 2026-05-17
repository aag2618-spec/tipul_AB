# 🔐 הנדאוף — תיקוני אבטחה שנותרו

**תאריך עדכון:** 2026-05-17
**Commit אחרון:** `9776454` (סבב 7 follow-up — דחוף ל-origin/main)
**מסמך מקור:** `פריצות אבטחה 6.md` + `HANDOFF-security-round7.md`

---

## ⚠️ לפני שמתחילים — חובה לקרוא!

**קובץ זיכרון גלובלי:** `feedback_security_fixes.md`
- 10 כללים מפורשים לעבודה על אבטחה
- 5 סוכנים בלולאה לפני push (3 סנכרון + עד 2 תקינות)
- סדר checks (auth → scope → consent)
- מיפוי לפני שינוי, logger לא console, וכו'

אם אתה לא קורא את הקובץ הזה לפני שאתה מתחיל לקודד — **עצור עכשיו.**

---

## ✅ מה כבר תוקן (לא לחזור!)

### בקומיט `bad58ca` (סבב 7):
- H1 — Logger sanitize (deny-list + cap)
- H2 — zod `.strict()` ל-8 payment routes
- H3 — zod `.strict()` ל-subscription/toggle-auto-renew
- H4 — Impersonation timeout 4h→30m
- H5 — EXIF stripping (sharp.rotate)
- M1 — Client.consentToAI + helper ai-consent.ts (חיווט חלקי)
- M2 — AI timeout 30s/180s + capTranscription 100K
- M3 — sanitizeAiText/sanitizeAiResponse helpers
- M4 — Receipt token 96→128 bit + תאימות לאחור
- M6 — Reset tokens hashed (SHA-256) + CAS על usedAt

### בקומיט `9776454` (סבב 7 follow-up — הצ'אט הזה):
- ✅ **7 AI routes חדשים מוגנים** (consent + sanitize, אחרי scope check):
  - `ai/questionnaire/analyze-combined`
  - `ai/questionnaire/analyze-single`
  - `ai/questionnaire/progress-report`
  - `ai/session/analyze` (עם issueRefund אם consent נכשל)
  - `ai/session-prep`
  - `transcribe`
  - `questionnaires/responses/[id]/analyze`
- ✅ **PII leak ב-google-ai.ts** — console.error → logger.error (6 מקומות)
- ✅ **PNG bomb mitigation** — sharp `limitInputPixels: 50_000_000`
- ✅ **JPG/WebP quality 90→95** — סריקות מסמכים נקיות יותר
- ✅ **console.warn → logger.warn** ב-file-validation.ts
- ✅ **Logger deny-list הורחב** — tax(?!onomy)|\bvat|salary|income|passport
- ✅ **Info Disclosure תוקן** ב-3 routes (consent אחרי scope, לא לפני)
- ✅ **Tests תוקנו** — permissions ALL_PERMISSIONS (47) + admin.test.ts mock (CARDCOM_WEBHOOK_PER_IP + GLOBAL)
- ✅ **render.yaml comment** — 4h → 30m

---

## 🚨 מה נשאר לעבוד עליו

### ✅ הושלם — UI ל-consentToAI (M1) — 2026-05-17

**מה תוקן (7 קבצים, אושר ע"י 5 סוכנים):**
1. ✅ Zod schema של PUT/POST clients הוסיף `consentToAI`
2. ✅ API mutations מעדכנים `consentToAIAt = new Date()` כשהערך משתנה + logger.info
3. ✅ Switch בטופס יצירת מטופל (`new/page.tsx`) — ברירת מחדל true
4. ✅ Card מלא "הסכמה לעיבוד נתונים ב-AI" בטופס עריכה (`edit/page.tsx`) — עם תאריך עדכון ואזהרה כש-false
5. ✅ Badge אדום "AI חסום" בכרטיס המטופל (`[id]/page.tsx`) — מוצג רק כש-`consentToAI === false`
6. ✅ `getClientSafeSelectForSecretary` חושף את השדות (מזכירה רואה סטטוס משפטי-אדמיניסטרטיבי)

**עדיין לא נעשה (עדיפות נמוכה):**
- עמודה בטבלת clients בדשבורד שמציגה "AI: כן/לא" — nice-to-have
- שדה ב-intake-questionnaire להחתמה ראשונית בטופס המטופל

---

### 🟡 בינוני — Info Disclosure ב-2 AI routes (התגלה ב-M1 review, 2026-05-17)

**הבעיה:** ב-`src/app/api/analyze/summary/route.ts` ו-`src/app/api/analyze/note/route.ts`, הקריאה ל-`requireAiConsent(clientId)` מתבצעת **לפני** scope check (`findFirst` עם `buildClientWhere`). תוקף שיודע clientId של ארגון אחר יכול לעורר 403 שמגלה את ערך ה-`consentToAI` (boolean) של מטופל זר.

**Impact:** דליפת מידע מינימלית (boolean אחד), אבל מפר את עיקרון "scope לפני consent" שנקבע בסבב 7 (`feedback_security_fixes.md` חוק 3).

**תיקון:** להעביר את `requireAiConsent` להיות **אחרי** `findFirst` שמאמת בעלות.

**קבצים:**
- `src/app/api/analyze/summary/route.ts:39-79`
- `src/app/api/analyze/note/route.ts:66-110`

---

### 🟠 גבוה — Vectors שנמצאו על-ידי pentest

#### 1. PII timing attack על reset-password
**הבעיה:** `prisma.passwordReset.findUnique` רץ באותו זמן לכל token, אבל bcrypt(12) רץ רק על token תקף → תוקף יכול למדוד הבדל 150-300ms ולוודא ש-token פעיל ולמפות emails.
**תיקון מוצע:** dummy bcrypt גם בכשל, או delay אחיד.
**קובץ:** `src/app/api/auth/reset-password/route.ts`

#### 2. Token length downgrade על receipt
**הבעיה:** `verifyReceiptToken` מקבל 24 וגם 32 — תוקף יכול לתקוף את הגרסה החלשה (96-bit) גם על payments חדשים.
**תיקון מוצע:** שדה `receiptTokenVersion` ב-Payment + sunset לתאימות לאחור אחרי 30 יום.
**קבצים:** `prisma/schema.prisma`, `src/lib/receipt-token.ts`, `src/app/api/receipts/[id]/public/route.ts`

#### 3. Reset token Referer leak
**הבעיה:** `/reset-password?token=PLAINTEXT` ב-querystring יכול לדלוף ב-Referer header אם הדף טוען scripts/images חיצוניים.
**תיקון מוצע:** העברת token כ-URL fragment (`#token=...`) או דרך POST.
**קבצים:** `src/app/api/auth/forgot-password/route.ts`, `src/app/reset-password/page.tsx`

---

### 🟡 בינוני

#### 4. EXIF — size re-check אחרי sharp
**הבעיה:** `validateFileBuffer` בודק גודל input. אחרי `stripImageMetadata`, ה-output יכול תיאורטית להיות גדול (תרחיש נדיר עם quality 95 + PNG).
**תיקון מוצע:** guard `if (newBuffer.length > maxSizeBytes) throw`.
**קבצים:** `src/app/api/documents/route.ts`, `src/app/api/communications/reply/route.ts`, `src/lib/support-attachments.ts`

#### 5. UI handlers ל-consent response
**הבעיה:** 3 UI components קוראים `data.error` אבל ה-AI routes מחזירים `data.message`. ההודעה הספציפית של consent ("המטופל סימן שלא מאשר...") לא תוצג בtoast.
**קבצים שצריכים תיקון:**
- `src/components/ai/questionnaire-analysis.tsx:87,123,167`
- `src/components/ai/session-analysis-buttons.tsx:50`
- `src/app/(dashboard)/dashboard/questionnaires/[id]/page.tsx:116`
**תיקון:** להחליף `data.error` ב-`data.message` ולבדוק `data.requiresConsent` להצגת link לעדכון consent.

---

### 🟢 נמוך — Observations (לא תוקנו)

#### L1 — JWT cache 30s window
revocation של block/role מאחר עד 30s בגלל cache.
**מצב:** `invalidateJwtCache()` קיים — צריך לוודא שכל route ששינוי role/isBlocked קורא לו.
**קובץ:** `src/lib/auth.ts:17`

#### L2 — CRON_SECRET_PREVIOUS rotation alert
אין reminder כש-CRON_SECRET_PREVIOUS עדיין בשימוש (סימן ל-rotation שלא הסתיים).
**תיקון:** Slack/email alert ב-`src/lib/cron-auth.ts`.

#### L3 — Booking slug enumeration
404 שונה בין "לא קיים" ל-"לא פעיל".
**קובץ:** `src/app/api/booking/[slug]/route.ts:148-159`
**תיקון:** 404 אחיד.

#### L5 — Filename RTL override
Content-Disposition לא הגנה מ-RTL override (`‮`).
**קובץ:** `src/app/api/uploads/[...path]/route.ts:222`
**מצב:** Cosmetic.

#### L6 — Audit log חסר ב-2FA verify
**תיקון:** עטיפה ב-`withAudit` ב-`src/app/api/auth/2fa/verify/route.ts`.

---

## 🧪 איך לעבוד על זה בצ'אט חדש

### תיעדוף מומלץ:
1. **קודם:** UI ל-consentToAI (חוסם opt-out לפי חוק)
2. **אחר כך:** 3 vectors מ-pentest (timing, receipt downgrade, Referer leak)
3. **אחר כך:** UI handlers ל-consent response (5 קבצים)
4. **שיפורים:** size re-check אחרי sharp
5. **Observations L1-L6:** עבודת תחזוקה

### לפני שינוי כלשהו:
**קרא לפי הסדר:**
1. `feedback_security_fixes.md` — 10 כללים + סדר עבודה
2. `feedback_coding_standards.md` — T3, Prisma Decimal, Date null, force-dynamic
3. `feedback_parallel_chats.md` — לא `git add .`, רק קבצים ספציפיים
4. `feedback_hebrew_ui.md` — כל UI text בעברית

### Helpers שכבר קיימים (לא לכתוב שוב):
- `src/lib/ai-consent.ts` — `requireAiConsent(clientId)`
- `src/lib/sanitize-html.ts` — `sanitizeUserHtml()`, `sanitizeAiText()`, `sanitizeAiResponse()`
- `src/lib/file-validation.ts` — `validateFileBuffer()`, `stripImageMetadata()`
- `src/lib/logger.ts` — `logger.info/warn/error` עם sanitize
- `src/lib/receipt-token.ts` — `generateReceiptToken()`, `verifyReceiptToken()` (תומך 24+32)

### לפני push:
**חובה לפי `feedback_security_fixes.md` חוק 8:**
- 5 סוכנים בלולאה (3 סנכרון + עד 2 תקינות)
- חוזרים על זה עד שכל ה-5 מאשרים ✅
- אסור לדחוף עם ⚠️ פתוח

---

## 📊 סיכום

- **סבב 7 + follow-up:** 30+ פריצות תוקנו ב-2 commits (`bad58ca` + `9776454`).
- **נשאר:** 1 דחוף (UI consent) + 3 גבוה (pentest vectors) + 2 בינוני + 5 נמוך = **11 פריטים**.
- **הערכת זמן:** UI consent ≈ 2-4 שעות, pentest vectors ≈ 4-6 שעות, השאר ≈ 6-8 שעות. סה"כ ≈ יום עבודה מלא לסבב 8.
