# HANDOFF — סבב אבטחה 19

**תאריך:** 2026-05-25
**מסמך מקור:** `SECURITY_AUDIT_2026-05-25.md`

---

## מה מתוקן בסבב הזה

### 19.1 — ניקוי Cache Storage ב-logout ⚠️ בינוני
- **Status:** `done` ✅ (commit 2b44bd5)
- **בעיה:** Service Worker לא שומר API responses (תוקן), אבל ב-logout לא מתבצע ניקוי של ה-Cache Storage. דפים סטטיים שנשמרו ב-cache יכולים להישאר על מחשב משותף.
- **קבצים:**
  - `public/sw.js` — הוספת message handler ל-LOGOUT
  - `src/lib/logout.ts` — helper חדש שמנקה caches ואז קורא ל-signOut
  - `src/components/dashboard-header.tsx:354` — החלפת signOut
  - `src/components/admin-header.tsx:87` — החלפת signOut
  - `src/app/clinic-admin/layout.tsx:214` — החלפת signOut
  - `src/app/blocked/page.tsx:144` — החלפת signOut
  - `src/app/auth/2fa-verify/page.tsx:306` — החלפת signOut
  - `src/app/admin/layout.tsx:347` — החלפת signOut

### 19.2 — שיפור email incoming tenant routing ⚠️ בינוני
- **Status:** `done` ✅ (commit 2b44bd5)
- **בעיה:** `findFirst` לפי email גלובלי. יש ambiguity guard (409 על כפילות), אבל אין scoping לפי therapist.
- **שיפור:** לנסות לזהות את המטפל מ-`to` field ולסנן לפי `therapistId`.
- **קובץ:** `src/app/api/email/incoming/route.ts`

---

## מה לא בסבב הזה (תשתית — לצ'אטים אחרים)

- prisma db push → migrate deploy (דורש פעולה ידנית ב-Render)
- scheduler כפול (החלטה ארכיטקטונית)
- rate limit בזיכרון → Redis (רלוונטי ב-scale-out)
- storage מקומי → S3 (תוכנית נפרדת ב-PLAN-s3-migration.md)
