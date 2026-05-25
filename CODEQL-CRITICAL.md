# CodeQL — Critical (1 alert) — תוקן!

## SSRF — Server-Side Request Forgery
- **קובץ:** `src/app/api/admin/cardcom-transactions/[id]/sync-cardcom/route.ts:107`
- **בעיה:** `new URL(request.url).origin` שימש כ-fallback ליצירת URL לקריאת webhook פנימית. תוקף עם Host header זדוני יכול לגרום לשרת לעשות fetch לכתובת חיצונית.
- **סטטוס:** **תוקן** — הוסר ה-fallback מ-request.url. עכשיו חובה NEXT_PUBLIC_BASE_URL / NEXTAUTH_URL.
- **Commit:** 32f4c93 (SSRF fix בתוך אותו commit)

**אין צורך בצ'אט נוסף — הכל טופל.**
