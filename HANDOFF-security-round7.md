# 🔐 הנדאוף — סבב אבטחה 7 — מה שנותר לעבוד עליו

**תאריך:** 2026-05-17
**Commit אחרון:** `867ff48` (main, נדחף לרמוט)
**מסמך מקור:** `פריצות אבטחה 6.md`

---

## ✅ מה הושלם (לידיעה — לא לחזור על זה)

מסבב 7, כל הפריצות הבאות תוקנו ב-`commit 867ff48`:

- **H1** — Logger sanitize (deny-list מקיף + 500-char cap + JSON.stringify מוגן)
- **H2** — zod `.strict()` על 8 payment routes
- **H3** — zod `.strict()` על subscription/toggle-auto-renew
  (subscription/create דולג — היה בעבודת הצ'אט המקביל)
- **H4** — Impersonation timeout 4h→30m (lazy JWT + cron + UI: banner/dialog/history)
- **H5** — EXIF stripping ב-3 נתיבי uploads (documents, communications/reply, support attachments) דרך sharp.rotate()
- **M1** — Client.consentToAI (Boolean? default true) + helper `src/lib/ai-consent.ts`. AI routes חוסמים רק כש-false במפורש. החל ב-analyze/{note,route,summary}
- **M2** — AI timeout (30s default, 180s תמלול) + capTranscription 100K chars
- **M3** — sanitizeAiText + sanitizeAiResponse (recursive, MAX_DEPTH=8) ב-3 analyze routes
- **M4** — Receipt token 96→128 bit, verify מקבל גם 24 לתאימות לאחור, `receipts/[id]/public` route מקבל שני אורכים
- **M6** — Reset tokens hashed (SHA-256) ב-DB, plaintext רק במייל, transaction עם CAS על usedAt למניעת race
- **M7** — כבר היה קיים (rate-limit על MFA/2FA verify)
- **M8, M9** — מסומנים false-positive במסמך המקור — לא נדרשת פעולה
- **C1-C9, H1-H11** — מתוקנים בסבבים קודמים (לפי המסמך)

---

## 🚨 מה נשאר לעבוד עליו (לפי עדיפות)

### 🔴 דחוף — UI חסר ל-consentToAI (M1)

**הבעיה:** המיגרציה הוסיפה את השדה `Client.consentToAI` עם default `true`, אבל **אין UI** שמאפשר למטפל לסמן `false` למטופל שמסרב.

**מה חסר:**
1. checkbox/toggle בכרטיס המטופל (`src/app/(dashboard)/dashboard/clients/[id]/page.tsx` או edit form)
2. שדה ב-zod schema של עדכון client
3. עדכון API route שמטפל ב-PUT/PATCH של Client
4. שדה ב-intake-questionnaire או consent-form להחתמה ראשונית

**Why חשוב:** בלי UI, המטפל לא יכול לכבד opt-out של מטופל לפי חוק הגנת הפרטיות §13.

**מומלץ:** להוסיף checkbox ב-edit-client form + עדכון `consentToAIAt = now()` בשמירה. גם להוסיף עמודה בטבלת clients בדשבורד שמציגה "AI: כן/לא".

---

### 🟠 גבוה — Vectors שנמצאו על-ידי סוכני pentest

#### 1. PII enumeration דרך timing על reset-password
**מקור:** סוכן 4, ממצא #1
**הבעיה:** `prisma.passwordReset.findUnique` רץ באותו זמן לכל token, אבל bcrypt(12) רץ רק על token תקף → תוקף יכול למדוד הבדל 150-300ms ולוודא שtoken פעיל.
**תיקון מוצע:** להריץ bcrypt דמה גם בכשל, או delay אחיד.
**קובץ:** `src/app/api/auth/reset-password/route.ts`

#### 2. Token length confusion / downgrade attack על receipt
**מקור:** סוכן 4, ממצא #2
**הבעיה:** `verifyReceiptToken` מקבל גם 24 וגם 32 — תוקף יכול תמיד לבחור 24 ולתקוף את הגרסה החלשה (96-bit) על payments חדשים.
**תיקון מוצע:** להוסיף שדה `receiptTokenVersion` ב-Payment (96 או 128). פיילות עתידי: ביטול תמיכה ב-24 אחרי 30 יום.
**קבצים:** `prisma/schema.prisma`, `src/lib/receipt-token.ts`, `src/app/api/receipts/[id]/public/route.ts`

#### 3. PNG bomb / pixelLimit ב-sharp
**מקור:** סוכן 4, ממצא #5
**הבעיה:** `failOn:"none"` ב-sharp לא מגביל pixelLimit. תמונה זדונית 1KB→1GB אחרי דקודינג.
**תיקון מוצע:** להוסיף `limitInputPixels: 50_000_000` ב-sharp config (50M פיקסלים — ~5MB RGB).
**קובץ:** `src/lib/file-validation.ts` (פונקציה `stripImageMetadata`)

#### 4. Reset token plaintext ב-URL → Referer leak
**מקור:** סוכן 4, ממצא #4
**הבעיה:** `/reset-password?token=PLAINTEXT` ב-querystring יכול לדלוף ב-Referer header אם הדף טוען scripts/images חיצוניים.
**תיקון מוצע:** העברת ה-token כ-URL fragment (`#token=...`) או דרך POST.
**קבצים:** `src/app/api/auth/forgot-password/route.ts` (URL building), `src/app/reset-password/page.tsx` (קריאת ה-token).

---

### 🟡 בינוני — שיפורים שלא תוקנו

#### 5. EXIF — תמונה אחרי sharp לא נבדקת שוב מול 25MB
**מקור:** סוכן 2
**הבעיה:** `validateFileBuffer` רץ על input. אחרי `stripImageMetadata`, ה-output יכול תיאורטית להיות גדול יותר (תרחיש נדיר).
**תיקון מוצע:** להוסיף guard `if (newBuffer.length > maxSizeBytes) throw`.
**קבצים:** `src/app/api/documents/route.ts`, `src/app/api/communications/reply/route.ts`, `src/lib/support-attachments.ts`

#### 6. JPG quality 90 — double-encoding דחוס סריקות מסמכים
**מקור:** סוכן 3
**הבעיה:** JPG שכבר נדחס פעם, sharp ידחוס שוב ב-90 → ירידת איכות גלויה לסריקות.
**תיקון מוצע:** להגדיל ל-`quality: 95` או להפעיל strip-only ללא re-encode מלא.
**קובץ:** `src/lib/file-validation.ts` (`stripImageMetadata`)

#### 7. AI routes נוספים שלא קיבלו sanitize+consent
**מקור:** הסבב לא כיסה את כל ה-routes
**Routes שעדיין צריך לעדכן:**
- `src/app/api/ai/questionnaire/analyze-combined/route.ts`
- `src/app/api/ai/questionnaire/analyze-single/route.ts`
- `src/app/api/ai/questionnaire/progress-report/route.ts`
- `src/app/api/ai/session/analyze/route.ts`
- `src/app/api/ai/session-prep/route.ts`

לכל אחד מהם צריך להוסיף:
1. `import { requireAiConsent } from "@/lib/ai-consent"`
2. `import { sanitizeAiResponse } from "@/lib/sanitize-html"`
3. קריאה ל-`requireAiConsent(clientId)` אחרי auth/scope
4. עטיפת תוצאת ה-AI ב-`sanitizeAiResponse`

#### 8. Logger — חסרים keys בדפוס
**מקור:** סוכנים 1+4
**הוספות מוצעות לרגקס ב-`src/lib/logger.ts`:**
- `tax`, `vat`, `salary`, `income`
- `dob`, `dateOfBirth`, `passport`
- ערכים פיננסיים שלא מכוסים כיום

---

### 🟢 נמוך — Observations מהמסמך המקורי (לא בוצעו)

#### L1 — JWT cache 30s window
**מקור:** דוח אבטחה 6
**הבעיה:** revocation של block/role יכולה לאחר עד 30s בגלל cache.
**מקום:** `src/lib/auth.ts:17`
**מצב:** כבר קיים `invalidateJwtCache()` — צריך לוודא שכל route ששינוי role/isBlocked קורא לו.

#### L2 — CRON_SECRET_PREVIOUS rotation alert
**מקור:** דוח אבטחה 6
**הבעיה:** אין reminder כש-CRON_SECRET_PREVIOUS נמצא בשימוש (סימן שעדיין לא הסתיים rotation).
**תיקון:** Slack/email alert ב-`src/lib/cron-auth.ts`.

#### L3 — Booking slug enumeration
**מקור:** דוח אבטחה 6
**הבעיה:** 404 שונה בין "לא קיים" ל-"לא פעיל".
**קובץ:** `src/app/api/booking/[slug]/route.ts:148-159`
**תיקון:** 404 אחיד.

#### L5 — Filename RTL override
**מקור:** דוח אבטחה 6
**הבעיה:** Content-Disposition לא הגנה מ-RTL override (`‮`).
**קובץ:** `src/app/api/uploads/[...path]/route.ts:222`
**מצב:** Cosmetic.

#### L6 — Audit log חסר ב-2FA verify
**מקור:** דוח אבטחה 6
**תיקון:** עטיפת ב-`withAudit` ב-`src/app/api/auth/2fa/verify/route.ts`.

---

## 🧪 איך לעבוד על זה ב-chat חדש

### תיעדוף מומלץ:
1. **קודם:** UI ל-consentToAI (חסר לחלוטין, חוסם opt-out)
2. **אחר כך:** AI routes נוספים (סנכרון 5 routes)
3. **שיפורים:** sharp pixelLimit + JPG quality
4. **Defense-in-depth:** dummy bcrypt על reset-password
5. **Observations L1-L6:** עבודת תחזוקה

### לפני שינוי כלשהו ב-chat החדש:
- לקרוא `feedback_pre_push.md` (5 סוכנים לפני push)
- לקרוא `feedback_coding_standards.md` (T3 stack, Prisma Decimal, Date null, force-dynamic)
- לקרוא `feedback_parallel_chats.md` (לא `git add .`, רק קבצים ספציפיים)

### קבצים שהוספתי בסבב 7 שיוצרים API חדש:
- `src/lib/ai-consent.ts` — `requireAiConsent(clientId)` helper
- `src/lib/sanitize-html.ts` — `sanitizeAiText()` + `sanitizeAiResponse(value)` helpers
- `src/lib/file-validation.ts` — `stripImageMetadata(buffer, mime)` helper
- `src/lib/logger.ts` — sanitize אוטומטי, אין שינוי API חיצוני
- `src/lib/receipt-token.ts` — תאימות לאחור, אין שינוי API חיצוני

### Migration:
- `prisma/migrations/20260517_client_consent_to_ai/migration.sql` — נדחפה. כשפורסים ל-Render, היא תרוץ אוטומטית (Postgres 11+ ב-O(1)).

---

## 📊 סטטיסטיקה לסיכום

- **31 קבצים שונו**
- **715 שורות נוספו**
- **228 שורות הוסרו**
- **6 סוכני בדיקה מקבילים** מצאו ~30 ממצאים — 7 קריטיים תוקנו לפני commit, השאר ברשימת ההמשך הזו

---

**Last updated:** 2026-05-17 (קומיט `867ff48`)
