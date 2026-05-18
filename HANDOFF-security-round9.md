# 🔐 הנדאוף — סבב אבטחה 9 (בוצע, ממתין לאישור push)

**תאריך התחלה:** 2026-05-18
**Commit בסיס:** `2a34721` (סיום סבב 8)
**Commits של סבב 9:** `9ac7a30`, `713056c`, `9feb90a`, `e3f946b`
**מקור פריטים:** `HANDOFF-security-round8.md` — סעיף "פריטים שלא ב-scope של סבב 8"

---

## ✅ Checklist — פריטי סבב 9

| # | פריט | Risk | Status | Commit |
|---|------|------|--------|--------|
| 9.1 | 🟠 verify-email Referer leak (fragment) | High | done | `9ac7a30` |
| 9.2 | 🟠 Receipt PDF Referer leak (PHI) | High | done | `713056c` |
| 9.3 | 🟡 5 UI handlers — `data.message` | Medium | done | `9feb90a` |
| 9.4 | 🟡 Fallback אנגלי ב-UI (3 קבצים) | Medium | done | `e3f946b` |
| 9.5 | 🟢 Receipt-token prefilter cleanup (post-sunset) | Low | deferred — אחרי 2026-06-17 | — |
| 9.6 | 🟢 Upload size exceeded logging | Low | deferred | — |
| 9.7 | 🟢 Audit logging ל-receipt public access | Low | deferred | — |

---

## פירוט תיקונים

### 9.1 — verify-email Referer leak (commit `9ac7a30`)

ה-token של אימות אימייל היה ב-querystring (`/verify-email?token=PLAIN`) ולכן דלף ב-Referer header אם משתמש מנווט מהדף לעמוד אחר. זהה לתיקון M9 של reset-password בסבב 8.

קבצים (5):
- `src/app/api/auth/register/route.ts` — `verifyUrl` עם `#token=`
- `src/app/api/auth/resend-verification/route.ts` — אותו דבר
- `src/app/api/auth/verify-email/route.ts` — נוסף POST handler (token ב-body + rate-limit + zod)
- `src/app/(auth)/verify-email/page.tsx` — הפך מ-Server Component ל-Client; קורא מ-hash, מנקה ב-replaceState, מתקשר ל-POST
- `src/lib/validations/auth.ts` — `verifyEmailSchema`

Backward-compat: URLs ישנים שכבר נשלחו עם `?token=` עדיין עובדים (fallback ב-page).

### 9.2 — Receipt PDF Referer leak (commit `713056c`)

ה-token של קבלות ציבוריות (`/receipt/[id]?t=PLAIN`) דלף ב-Referer בזמן טעינת `html2canvas`+`jspdf`. PHI = High risk.

קבצים (2):
- `src/lib/receipt-token.ts` — `getReceiptPageUrl` בונה `#t=`
- `src/app/receipt/[id]/page.tsx` — קורא token מ-hash (fallback ל-`?t=`), מנקה URL

Backward-compat: URLs במייל שנשלחו עם `?t=` ימשיכו לעבוד.

### 9.3 — UI handlers `data.message` (commit `9feb90a`)

5 handlers ב-4 דפים התעלמו מ-`data.message` והציגו fallback קשיח. הודעת consent מ-API לא הוצגה למטפל.

קבצים (4):
- `src/app/(dashboard)/dashboard/sessions/[id]/page.tsx` (2 handlers)
- `src/app/(dashboard)/dashboard/clients/[id]/summaries/all/page.tsx`
- `src/app/(dashboard)/dashboard/recordings/[id]/page.tsx`
- `src/app/(dashboard)/dashboard/sessions/new/page.tsx`

Pattern: `data?.message || data?.error || fallback` (עברית). זהה לפריט 5 של סבב 8.

### 9.4 — Fallback אנגלי בעברית (commit `e3f946b`)

קבצים (3):
- `src/components/ai/session-analysis-buttons.tsx`
- `src/components/ai/questionnaire-analysis.tsx` (3 fallbacks)
- `src/app/api/questionnaires/responses/[id]/analyze/route.ts` (API 500 message — נשלח ל-UI)

המקרה בקובץ ה-API התגלה תוך כדי בדיקה — לא היה בHANDOFF המקורי. נכלל כאן כי הוא באותו spirit (UI text חייב עברית).

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

קבצי untracked שלא שלי (נשמרים בלתי-נגועים):
- `HANDOFF-aitier-not-upgrading.md`
- `HANDOFF-security-round7.md`
- `HANDOFF-subscription-upgrade.md`

## 📊 סטטוס תקינות

- `npx tsc --noEmit` — נקי (אחרי כל commit)
- `npx vitest run` — baseline בלבד: 4 קבצי-טסט / 3 tests (impersonation + DATABASE_URL) — 0 כשלים חדשים מ-סבב 9

## 🔜 הבא

5 סוכנים מקבילים → לולאה עד נקי → אישור משתמש → push.
