# HANDOFF — סבב אבטחה 2026-06-18 (וורקפלו security-review)

מקור: הרצת `.claude/workflows/security-review.js` במצב full. 17 ממצאים גולמיים, כולם אומתו יריבית (0/12 הופרכו).
תהליך: לפי `feedback_security_fixes.md` — מיפוי → תיקון לפי סדר auth→scope→action → logger לא console → tsc+vitest → 5 סוכנים בלולאה → פוש אוטומטי כשנקי. **שינוי אחד בכל פעם.**

## Checklist ממצאים (לפי עדיפות)

| # | חומרה | ממצא | קובץ | סטטוס |
|---|--------|------|------|--------|
| 1 | 🔴 High | מזכירה מקבלת שדות קליניים דרך `GET /api/clients/[id]?fields=basic` | `src/app/api/clients/[id]/route.ts:86` | ✅ **done** (commit + push) |
| 2 | 🟠 Med | תזכורות 24h/2h שולחות SMS חוזר כל 15 דק' בלי dedup ל-SMS | `src/app/api/cron/reminders/route.ts:71` + `reminders-2h` | ✅ **done** (5 סוכנים, 6 טסטים) |
| 3 | 🟠 Med | Pulseem webhook רושם body גולמי (תוכן SMS + טלפון) ללוגים | `src/app/api/webhooks/pulseem/route.ts:112` | ✅ **done** (5 סוכנים, טסט) |
| 4 | 🟠 Med | ADMIN/CLINIC_OWNER יכולים להתחבר בלי 2FA (אין force-enrollment) | `src/lib/two-factor.ts:121` | 🟡 **חלקי** — נוסף כפתור הפעלת 2FA במייל/SMS (5 סוכנים, 8 טסטים). **אכיפה (force) נדחתה לבחירת המשתמש.** |
| 5 | 🟡 Low | `error: String(error)` בתגובת 3 endpoints | `webhooks/resend:261`, `pulseem:245`, `cron/generate-alerts:221` | pending |
| 6 | 🟡 Low | Meshulam webhook סומך על `amount` מהלקוח (defense-in-depth) | `webhooks/meshulam/route.ts:647` | pending |
| 7 | 🟡 Low | CSP בדפים ציבוריים מתיר `unsafe-inline` ללא nonce | `next.config.ts:8` | pending |
| 8 | 🟡 Low | Rate-limiting in-memory בלבד (נשבר ב-multi-instance) | `src/lib/rate-limit.ts:55` | pending |
| 9 | 🟡 Low | CSV/Excel formula injection (clientName) בייצוא | `src/lib/export-utils.ts:623` | pending |
| 10 | 🟡 Low | MANAGER יכול לאפס סיסמת ADMIN — נחסם רק ב-handler | `src/lib/permissions.ts:94` | pending |
| 11 | 🟡 Low | proxy `/api/admin` משתמש ב-`includes()` (substring רחב מדי) | `src/proxy.ts:365` | pending |
| 12-17 | ⚪ Info | refund idempotency key, CSRF Lax-only, CSP img-src https:, proxy-only enforcement, impersonation step-up + (✅ אין IDOR) | שונים | פתוח לשיקול |

## ממצאים נוספים שהתגלו תוך כדי תיקון
- **debt-reminders חסר dedup ל-SMS** (`src/app/api/cron/debt-reminders/route.ts:344-358`): שולח `sendSMSIfEnabled(type:"DEBT_REMINDER")` ללא בדיקת SMS-SENT לפני (ה-dedup היחיד הוא על המייל). רץ פעם ביום אז ההצפה מוגבלת, אך אותו דפוס כמו #2. (התגלה ע"י סוכן הסייבר בסבב #2.) → מעקב נפרד.

## פערי כיסוי (מבקר) — לסבב המשך נפרד
- **Race/TOCTOU** ב-`/api/sessions` POST (אין $transaction Serializable כמו בנתיב הציבורי `/api/booking/t/[token]`) — double-booking.
- Mass-assignment (role/organizationId/price ב-PATCH), business-logic (credits/bulk-payment סכומים שליליים), audit fail-open, SSRF, timezone/DST על capability tokens.
- תת-מערכות שלא נסרקו לעומק: team-chat, saved-cards/טוקני אשראי, DSAR, encryption-at-rest, Google Calendar OAuth, maintenance endpoints, storage layer.

---

## #1 — דליפת PHI למזכירה דרך `fields=basic` (הושלם ✅)

**אימות 5 סוכנים (כולם ✅, ה-⚠️ של סוכן הצרכנים = הערת UX, לא רגרסיה):** הדליפה נסגרה, אין נתיב עוקף (כולל impersonation/casing); אף צרכן לא נשבר (השדות היחידים שמזכירה לא מקבלת = קליניים, הכוונה); 404/500/PUT תקינים; הטסט אומת אמפירית שתופס רגרסיה. tsc נקי, 957 טסטים עוברים.

**שתי הערות עתיד לא-חוסמות (מסוכן הסייבר):**
- `src/app/(dashboard)/dashboard/clients/page.tsx:31` — `getClients` עושה over-fetch של scalars (כולל קליניים) בצד-שרת, אך ה-`.map()` לא מסריאליז אותם ל-client → **לא דליפה**, אבל הקשחת defense-in-depth ראויה.
- docstring ב-`getClientSafeSelectForSecretary` (scope.ts) מזכיר `comprehensiveAnalysis` שנמחק עם פיצ'ר ה-AI — ניקוי תיעוד.

---

### תיאור מקורי

**שורש הבעיה:** ב-`GET /api/clients/[id]/route.ts` ענף `fields === "basic"` (שורה 86) נבדק **לפני** `isSecretary`, ומריץ `prisma.client.findFirst({ where })` **בלי `select`** → Prisma מחזיר את כל ה-scalars, כולל `notes/intakeNotes/initialDiagnosis/medicalHistory/therapeuticApproaches/approachNotes/culturalContext` (חסומים למזכירה לפי `CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY`). מזכירה יכלה לשלוף ישירות עם query-string.

**מיפוי צרכנים של `fields=basic` (7):** update-session-dialog, complete-session-dialog, session-detail-dialog (healthFund), intake/[clientId], clients/new (from quick), clients/[id]/email, clients/[id]/edit (קורא גם notes/initialDiagnosis/intakeNotes — קליני, נדרש למטפל בלבד).

**התיקון:** בענף `fields=basic` — להחיל `select: getClientSafeSelectForSecretary()` **רק כשמזכירה**; מטפל/בעלים מקבלים את כל השדות כרגיל (מורשים + דף העריכה צריך). הצדקת בטיחות: ה-PUT כבר חוסם כתיבת שדות קליניים ממזכירה (route.ts:241-265 → 403), וה-safe select כולל את כל שדות הבסיס שכל הצרכנים צריכים.

**בדיקה:** `src/app/api/clients/[id]/__tests__/route-secretary-basic-phi.test.ts` — מזכירה לא מקבלת קליניים אך מקבלת בסיס; מטפל מקבל הכל. משתמש ב-`getClientSafeSelectForSecretary` האמיתי (mock רק ל-loadScopeUser+prisma).

**קבצים שנגעתי בהם (לפוש סלקטיבי — לא `git add .`):**
- `src/app/api/clients/[id]/route.ts`
- `src/app/api/clients/[id]/__tests__/route-secretary-basic-phi.test.ts`
- `HANDOFF-security-round-2026-06-18.md`
