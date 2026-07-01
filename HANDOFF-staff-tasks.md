# HANDOFF — פיצ'ר "מטלות צוות" (מנהלת/מזכירה → עובד)

**תאריך:** 2026-06-23 · **סטטוס:** הושלם ונדחף ל-main · db push לייצור בוצע · ⚠️ **טרם נבדק חי**

## קומיטים ב-main
- `5ab9c374` — הפיצ'ר המלא (שלבים 0-4).
- `30cc89e8` — תיקון מבדיקה חיה: ווידג'ט המטלות נוסף לדשבורד המזכיר + גוון סגול למטלות מנהל.

## מה הפיצ'ר עושה
- מנהלת (או מזכירה עם הרשאת `canAssignTasks`) יוצרת מטלה ושולחת לעובד אחד, או לכל המטפלים / כל המזכירות / כל הצוות (fan-out — רשומה לכל עובד עם `batchId` משותף).
- העובד רואה את המטלה בווידג'ט "מטלות ותזכורות" בדשבורד שלו (גוון **סגול** + תג "מהנהלת הקליניקה") + התראה בפעמון. מסמן "בוצע" ומוסיף טקסט "מה ביצעתי ואיך" (אופציונלי).
- המנהלת רואה לוח מעקב ב-`/clinic-admin/tasks`: כמה ביצעו / נצפה / באיחור + הערות הביצוע. מקובץ לפי `batchId`.
- **תבניות** לשליחה חוזרת + **מטלות חוזרות** (cron יומי/שבועי/חודשי) + **תזכורות על איחור** (cron).

## מבנה נתונים (`prisma/schema.prisma`)
- `Task` הורחב: `assignedById` (null=משימה אישית), `organizationId`, `completionNote`, `completedAt`, `seenAt`, `batchId`, `templateId`, `overdueReminderAt`.
- **החלטת מפתח:** `userId` = העובד שמחזיק/מבצע את המטלה (לא המקצה) → הווידג'ט הקיים מציג מטלות צוות בלי שינוי ב-GET, ומשימות אישיות ישנות נשארות תקינות בלי מיגרציה.
- `TaskType.STAFF_TASK` חדש. מודל `TaskTemplate` חדש + enums `TaskRecurrence` / `TaskAssignMode`.
- הרשאה `canAssignTasks` ב-`SecretaryPermissions` + helper מאוחד `canManageStaffTasks` ב-`src/lib/scope.ts`.

## קבצים עיקריים
- **API:** `src/app/api/clinic-admin/tasks/route.ts` (POST fan-out + GET לוח), `clinic-admin/staff/route.ts` (בורר עובדים), `task-templates/route.ts`+`[id]/route.ts` (CRUD), `cron/recurring-tasks/route.ts`, `cron/task-reminders/route.ts`, הרחבת `tasks/route.ts` + `tasks/[id]/route.ts`, `clinic-admin/me/route.ts`.
- **Lib:** `src/lib/staff-tasks.ts` (resolveStaffTaskTargets + createStaffTaskBatch), `scope.ts`, `scheduler.ts` (crons ב-06-08 שעון ישראל), `rate-limit.ts`, `proxy.ts` (allowlist מזכירה), `validations/staff-task.ts` + `task.ts`.
- **UI:** `src/app/clinic-admin/tasks/page.tsx` (לוח + מתג תבניות), `components/clinic-admin/assign-task-dialog.tsx`, `template-dialog.tsx`, `components/tasks/personal-tasks-widget.tsx` (תג+גוון+דיאלוג הערה), `components/dashboard/secretary-home.tsx` (הווידג'ט נוסף).

## אבטחה
- עבר security-review רב-סוכני (20 סוכנים, 2026-06-23). **הפיצ'ר נקי** — בידוד ארגוני אושר, אין IDOR.
- PHI: בלוח המעקב מזכירה רואה רק מטלות שהיא הקצתה (`assignedById=self`).
- תוקנו 2 ממצאי-פיצ'ר: נתיבי tasks/staff נוספו ל-allowlist המזכירה ב-proxy; rate-limit על יצירה.

## ⚠️ ממצאים שהתגלו בביקורת — לא קשורים לפיצ'ר
- **2 HIGH דליפת PHI בתשלומים** (POST/PUT /api/payments) — **כבר תוקן ב-main, commit `75a7c1e7`**.
- **HIGH: `.env.local` מכיל סודות production גלויים** (ENCRYPTION_KEY / DATABASE_URL / NEXTAUTH_SECRET / PULSEEM / RESEND) — **דורש החלפה (rotate) ע"י המשתמש ב-Render. טרם טופל.**
- low: Google OAuth signIn לא חוסם isBlocked (`auth.ts:315`). low: TOCTOU ב-`clients/[id]` delete.

## נותר לעשות
1. **בדיקה חיה** — מנהלת שולחת מטלה לעובד → העובד רואה בדשבורד, מסמן בוצע + הערה → המנהלת רואה בלוח.
2. ✅ **בוצע (2026-06-24):** שני ה-crons נוספו ל-Render — `recurring-tasks` (`crn-d8trcj6rnols73be7un0`, `5 4 * * *` = ~06:00 ישראל) ו-`task-reminders` (`crn-d8trcjlckfvc73eve580`, `20 4 * * *`), virginia/starter, deploy=live, משוכפלים מ-`cleanup-idempotency`. נבדקו חי → `200` והחזירו 0/0 (אין עדיין תבניות/איחורים). השעון הפנימי ממשיך להריצם במקביל — בטוח כי שניהם אידמפוטנטיים.
3. **rotate** של הסודות ב-`.env.local`.

## הערות תפעוליות
- **עץ עבודה משותף** עם צ'אטים מקבילים — אסור `git add .`; commits עם שמות קבצים מפורשים בלבד.
- **db push לייצור:** `DOTENV_CONFIG_PATH=.env.local npx prisma db push` (ה-CLI לא טוען `.env.local` אוטומטית).
- **build על Windows:** `npx next build` (לא `npm run build`).
- תוכנית מלאה: `.claude/plans/wiggly-plotting-quokka.md`. זיכרון Claude Code: `project_staff_tasks.md`.
