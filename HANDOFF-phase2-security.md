# Handoff: Phase 2 Security Hardening

**ממשיך** מ-Phase 1 שהושלם ב-`991e4d3c` ו-`3ea7020a`. חוקי תיאום בין-צ'אטים נטענים אוטומטית מ-`.cursor/rules/multi-chat-coordination.mdc`.

## מה כבר נעשה ב-Phase 1 (אל תיגע — ב-main)

- ✓ `resolveTherapistIdForClient` ב-`src/app/api/clients/route.ts`
- ✓ `finalTherapistId` + inherit-from-client ב-`src/app/api/sessions/route.ts`
- ✓ Role-gate (רק owner/secretary יכולים למקד מטפל אחר)
- ✓ `canViewPayments` מסונן ב-`GET /api/clients/[id]`
- ✓ `canViewDebts` נדרש ב-`send-debt-reminder`
- ✓ `canViewStats` נאכף בדף `/dashboard/reports`
- ✓ שדה `location` בדיאלוג פגישה חדשה
- ✓ `.trim()` ב-Zod ל-`therapistId`

## משימות Phase 2

### עדיפות גבוהה — תיקון אותו pattern ב-routes נוספים

**1. חלץ helper משותף ל-`src/lib/scope.ts`**
- `resolveTherapistIdForClient` (קיים ב-`src/app/api/clients/route.ts`) → להעביר ל-`src/lib/scope.ts`.
- `resolveTherapistIdForSession` (קיים inline ב-`src/app/api/sessions/route.ts`) → להעביר ל-`src/lib/scope.ts`.
- וודא שהקריאות הקיימות לא נשברות.

**2. הפעל את ה-helper ב-routes הבאים** (פתורים כיום עם `therapistId: userId` שגוי):
- `src/app/api/recurring-patterns/apply/route.ts` (שורות 127, 193)
- `src/app/api/sessions/[id]/route.ts` (שורה 189) — בדיקת חפיפה ב-PUT צריכה להשתמש ב-`existingSession.therapistId`, לא `userId`
- `src/app/api/clients/[id]/commitments/route.ts` (שורה 86)
- `src/app/api/documents/route.ts` (שורה 148)
- `src/app/api/consent-forms/route.ts` (שורה 110)
- `src/app/api/communications/attachments/route.ts` (שורה 206)

**3. תיקון booking ציבורי**
- `src/app/api/booking/[slug]/route.ts` יוצר client/session ללא `organizationId`.
- הוסף `organizationId` מתוך `settings.therapist.organizationId`.

**4. תיקון server-component leak**
- `src/app/(dashboard)/dashboard/clients/[id]/page.tsx` (Server Component, **לא** API).
- טוען `payments` דרך Prisma ישירות ללא בדיקת `canViewPayments`.
- הוסף את אותו gate שב-API route.
- **זהירות**: צ'אטים אחרים נגעו בקובץ הזה — בדוק `git log` לפני עריכה.

**5. Audit log ל-delegated creates**
- בכל מקום שיש `finalTherapistId !== userId`, רשום ל-`AdminAuditLog` דרך `withAudit`:
  - `operatorId`
  - `targetTherapistId`
  - `recordType`
  - `action: "CREATE"`
- זה ייתן לבעלת קליניקה לעקוב מי יצר מה לטובת מי.

**6. Impersonation + logDataAccess**
- `src/lib/audit-logger.ts` — `logDataAccess` כיום רושם `userId` אפקטיבי (= המתחזה).
- צריך לרשום `originalUserId` כ-actor אמיתי + `impersonatedBy` ב-meta.
- דוגמה תקינה: `src/app/api/admin/export-personal-data` — חקה את הדפוס.

### עדיפות בינונית

**7. UI — בורר מטפל בדיאלוגי יצירה (Phase 4)**
- `src/components/calendar/new-session-dialog.tsx`
- `src/app/(dashboard)/dashboard/clients/new/page.tsx`
- הוסף `Select` של מטפלי הקליניקה למזכירה/בעלים.
- אחרי שעובד, אפשר להחמיר את השרת: secretary ללא `therapistId` → 400.

**8. החבאת כפתור** `send-debt-reminder` כשאין `canViewDebts`.

### עדיפות נמוכה

**9.** `console.error` → `logger.error` בכל הפרויקט (חוק קיים).

**10.** הודעות שגיאה באנגלית → עברית עקביות.

## חוקי עבודה

מ-`.cursor/rules/multi-chat-coordination.mdc` (אוטומטי, אבל למקרה שלא נטען):

1. **סקופ קבצים strict** — רק קבצים מהרשימה למעלה. אם `git status` מראה שינויים שלא ביקשתי → של צ'אט אחר, אל תוסיף.
2. **5 סוכנים חובה לפני כל commit**: security / backward-compat / multi-tenancy / UX / build pipeline.
3. **חכה עד GREEN מכל ה-5** לפני commit. YELLOW/RED → תקן + הרץ סוכן שוב.
4. **שמור backward-compat** — אסור לשבור זרימות קיימות בלי אישור מפורש.
5. **`git add` במפורש** — אסור `git add .`.
6. **Push אוטומטי** אחרי commit מוצלח.
7. **קבצי דיבאג זמניים** (`.tsc-*`, `.vitest-*`, `.eslint-*`) — לא לכלול ב-commit.

## תתחיל מ

משימה **1** (חילוץ ה-helper). זה הכי גנרי ויקל על משימות 2 ו-5. כשתסיים — commit + push לפני שתעבור למשימה 2.
