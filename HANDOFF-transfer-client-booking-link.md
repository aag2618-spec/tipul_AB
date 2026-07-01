# HANDOFF — ביטול BookingLink בהעברת מטופל (transfer-client)

## הבעיה (task_4eec33de — מביקורת אבטחה של send-link, יוני 2026)
`src/app/api/clinic-admin/transfer-client/route.ts` מעביר מטופל מ-A ל-B (מעדכן
`client.therapistId` + מטפל בפגישות עתידיות) אבל **לא נגע ב-`BookingLink`**.
הקישור הפעיל נשאר עם `therapistId = A`. מטופל שנכנס לקישור הישן וקובע תור →
הפגישה נוצרת אצל A, כי `src/app/api/booking/t/[token]/route.ts` (`handleCreate`)
טוען `bookingSettings` לפי `link.therapistId` ויוצר את ה-`TherapySession` עם
אותו `therapistId`. זה סותר את כוונת ההעברה.

רשת ביטחון חלקית קיימת: `send-link` מיישר `therapistId`+`organizationId` בכל
שליחה חוזרת (נתיב reuse), אבל יש חלון בין ההעברה לשליחה הבאה.

## ההחלטה: ביטול (REVOKED), לא יישור
- עקבי עם ברירת המחדל של ההעברה (ניתוק נקי — פגישות עתידיות מבוטלות).
- הקישור הוא snapshot של הקשר עם A (גוף הודעה "A מזמין/ה אותך", destinationEmail/Phone, OTP) — יישור משאיר הודעה ישנה בשם A שמובילה ל-B.
- `send-link` ייצור קישור חדש ונקי בשם B כשצריך (מחפש `status: "ACTIVE"` → לא ימצא → create).
- `evaluateBookingLinkAccess` כבר מחזיר 410 ל-REVOKED — אין צורך בקוד צד-קריאה.

## השינוי (קובץ אחד: transfer-client/route.ts)
בתוך ה-`prisma.$transaction` של `withAudit`, אחרי עדכון `client.therapistId` (שלב 2.5):
```ts
const revokedLinks = await tx.bookingLink.updateMany({
  where: { clientId, status: "ACTIVE" },
  data: { status: "REVOKED" },
});
```
- סינון לפי `clientId` בלבד (כבר org-validated דרך ה-client + race-guard) — **לא** לפי `organizationId`, כי הוא `String?` ב-BookingLink ויחמיץ קישורים ישנים עם `org=null`.
- אטומי: באותו transaction עם עדכון ה-therapistId והפגישות.
- summary לאודיט (`reason`) + `revokedBookingLinkCount` ב-result.

## בדיקות
- [x] `npx tsc --noEmit` — נקי
- [x] `npx eslint` על הקובץ — נקי
- [x] `npx vitest run src/lib/__tests__/booking-links.test.ts` — 28/28
- [x] `npx next build` (Windows) — exit 0
- [x] ביקורת סייבר/PHI/IDOR (סוכן) — ✅ 0 ממצאים (אטומיות, אין IDOR, clientId-only נכון, חלון OTP נסגר, אין דליפת PHI, enum תואם)
- [x] תקינות קוד + סנכרון — אומת ידנית: force-dynamic קיים, logger בלבד, אין any, send-link reuse ידלג על REVOKED ויצור חדש, שאר bookingLink.update לפי link.id (לא מושפע)

## Status: ready — ממתין לאישור המשתמש ל-commit + push (לבקשתו)
