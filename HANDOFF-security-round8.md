# 🔐 הנדאוף — סבב אבטחה 8 (סיום)

**תאריך:** 2026-05-18
**Commit בסיס:** `8f1ff95` (סיום סבב 7 + M1)
**Commits של סבב 8:** `b972f0e`, `c77e94a`, `f33479f`, `5bf910d`, `ebc4f6a`, `3f1d9a9`

---

## ✅ מה תוקן בסבב 8

| # | פריט | Commit | קבצים |
|---|------|--------|--------|
| 1 | 🟠 Reset-password timing attack | `b972f0e` | `src/app/api/auth/reset-password/route.ts` |
| 2 | 🟠 Receipt token downgrade — version + sunset | `c77e94a` | schema, migration, `src/lib/receipt-token.ts`, `src/app/api/receipts/[id]/public/route.ts` |
| 3 | 🟠 Reset token Referer leak — URL fragment | `f33479f` | `src/app/api/auth/forgot-password/route.ts`, `src/app/(auth)/reset-password/page.tsx` |
| 4 | 🟡 Info Disclosure — consent אחרי scope | `5bf910d` | `src/app/api/analyze/summary/route.ts`, `src/app/api/analyze/note/route.ts` |
| 5 | 🟡 UI handlers ל-consent response | `ebc4f6a` | `src/components/ai/questionnaire-analysis.tsx`, `src/components/ai/session-analysis-buttons.tsx`, `src/app/(dashboard)/dashboard/questionnaires/[id]/page.tsx` |
| 6 | 🟡 EXIF size re-check אחרי sharp | `3f1d9a9` | `src/app/api/documents/route.ts`, `src/app/api/communications/reply/route.ts`, `src/lib/support-attachments.ts` |

**סה"כ:** 6 commits, 18 קבצים (כולל migration), כל אחד נבדק ע"י 5 סוכנים מקבילים.

---

## 🚨 פריטים שלא ב-scope של סבב 8 — להעביר לסבב 9

### 🟠 גבוה

#### 9.1 — verify-email Referer leak (זהה לפריט 3 של סבב 8)
**הבעיה:** `/verify-email?token=PLAINTEXT` ב-querystring דולף ב-Referer.
**קבצים:**
- `src/app/api/auth/register/route.ts:183` (יצירת URL)
- `src/app/api/auth/resend-verification/route.ts:95` (יצירת URL)
- `src/app/(auth)/verify-email/page.tsx` (אם קיים — קורא token)

**תיקון:** identical to round 8 item 3 — fragment במקום querystring.

#### 9.2 — Receipt PDF page Referer leak (התגלה ע"י סוכן payments בפריט 3)
**הבעיה:** `/receipt/{id}?t={token}` ב-querystring. דף הקבלה טוען `html2canvas` + `jspdf` דינמית — אם יש תמונות/sources חיצוניים, Referer דולף.
**Risk:** High (PHI — קבלות רפואיות עם שמות מטופלים).
**תיקון:** `?t=` → `#t=` בכל הgenerators (`getReceiptPageUrl`), ועדכון `/receipt/[id]/page.tsx` לקרוא מ-hash.

### 🟡 בינוני

#### 9.3 — 5 UI handlers נוספים שמתעלמים מ-`data.message` (התגלו בפריט 5)
**קבצים:**
- `src/app/(dashboard)/dashboard/sessions/[id]/page.tsx:316,347`
- `src/app/(dashboard)/dashboard/clients/[id]/summaries/all/page.tsx:116-117`
- `src/app/(dashboard)/dashboard/recordings/[id]/page.tsx:158-159`
- `src/app/(dashboard)/dashboard/sessions/new/page.tsx:80-81`

**הבעיה:** הודעות שגיאה קשיחות ("שגיאה בניתוח") במקום ה-`data.message` מה-API. ה-consent message לא יוצג למטפל.
**תיקון:** identical to round 8 item 5 — `data.message || data.error || fallback`.

#### 9.4 — Fallback אנגלי ב-2 components (preexisting)
**קבצים:**
- `src/components/ai/questionnaire-analysis.tsx` — `"Failed to analyze"`, `"Failed to generate report"`
- `src/components/ai/session-analysis-buttons.tsx` — `"Failed to analyze session"`

**הבעיה:** `feedback_hebrew_ui.md` דורש כל UI text בעברית. fallback edge — נדיר אבל אפשרי.
**תיקון:** להחליף ל-`"שגיאה בניתוח"` וכו'.

#### 9.5 — Receipt-token prefilter אחרי sunset
**קובץ:** `src/app/api/receipts/[id]/public/route.ts`
**הבעיה:** ה-prefilter (`token.length !== 24 && token.length !== 32`) מקבל גם 24 וגם 32. אחרי sunset (2026-06-17) אפשר להוריד את ה-24 — חוסך DB hit על tokens שייכשלו ב-verify ממילא.

#### 9.6 — Upload size exceeded logging
**קבצים:** `src/app/api/documents/route.ts`, `src/app/api/communications/reply/route.ts`, `src/lib/support-attachments.ts`
**הבעיה:** ה-400 החדש (size re-check אחרי sharp) לא מתועד ב-audit/logger. ייעזר בזיהוי attempts לעקיפת maxSize.
**תיקון:** הוספת `logger.warn("[upload] size exceeded after strip", { userId, filename, originalSize, newSize })`.

### 🟢 נמוך (מ-HANDOFF-security-remaining.md)

ראה `HANDOFF-security-remaining.md` סעיף Observations L1-L6 (JWT cache, CRON_SECRET rotation alert, Booking slug 404, RTL override, 2FA audit).

#### 9.7 — Audit logging ל-receipt public access (התגלה בפריט 2)
**קובץ:** `src/app/api/receipts/[id]/public/route.ts`
**הבעיה:** גישה ציבורית לקבלה (PHI) לא מתועדת ב-`DataAccessAudit`/`AuditLog`. אם לקוח/תוקף ניגש לקבלה — אין trail.
**תיקון:** הוספת קריאה ל-`logDataAccess` עם resource type=Receipt.

---

## 📊 סיכום סבב 8

- **תוקנו:** 6 פריטים (3 גבוהים + 3 בינוניים).
- **לסבב 9:** 7+ פריטים שהתגלו תוך כדי הסבב + נמוכים מ-`HANDOFF-security-remaining.md`.
- **תהליך:** כל commit עבר 5 סוכנים מקבילים (Auth/Payments/AI-Scope/Build-Tests/CodeQuality) — לולאה עד נקי, push אחרי אישור.
- **רגרסיות:** 0. Baseline של 4 test files / 3 tests נשמר לאורך כל הסבב.

## 🚫 קבצי M1 — אסור לגעת!

(נשאר כפי שהיה)
- `src/app/api/clients/[id]/route.ts`
- `src/app/api/clients/route.ts`
- `src/lib/validations/client.ts`
- `src/lib/scope.ts`
- `src/app/(dashboard)/dashboard/clients/[id]/edit/page.tsx`
- `src/app/(dashboard)/dashboard/clients/new/page.tsx`
- `src/app/(dashboard)/dashboard/clients/[id]/page.tsx`
