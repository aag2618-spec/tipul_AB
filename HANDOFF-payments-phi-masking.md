# HANDOFF — מיסוך PHI בתשובות הכתיבה של תשלומים

**תאריך:** 2026-06-23
**סוג:** תיקון אבטחה (PHI leak, HIGH ×2)
**מקור:** ביקורת אבטחה רב-סוכנית — לא קשור לפיצ'ר מטלות הצוות (חוב קיים).

## הבעיה

מזכירה עם `canViewPayments` שיוצרת תשלום (`POST /api/payments`) או מעדכנת
תשלום (`PUT /api/payments/[id]`) מקבלת בתשובה את האובייקטים `client` ו-`session`
עם `include: { client: true, session: true }` מלא. תוסף `decryptDeep`
ב-`src/lib/prisma.ts` מפענח אוטומטית את השדות הקליניים, כך שב-DevTools (Network)
המזכירה רואה:

- על המטופל: `notes`, `initialDiagnosis`, `intakeNotes`, `medicalHistory`,
  `approachNotes`, `culturalContext` (ראה `ENCRYPTED_FIELDS.client` +
  `ENCRYPTED_JSON_FIELDS.client`).
- על הפגישה: `topic`, `notes` (ראה `ENCRYPTED_FIELDS.therapySession`).

ענפי `findUnique` (NO-OP, REPLACE, simple-update, וזרם ה-child ב-POST) מחזירים
**plaintext** (findUnique תמיד מריץ decryptDeep). שאר הענפים מחזירים ciphertext.
בשני המקרים מפתחות השדות הקליניים נמצאים בתשובה.

זאת בניגוד ל-GET של אותם נתיבים שכבר ממסך נכון (`secretaryInclude`).

## התיקון

החלת `getPaymentIncludeForRole(scopeUser)` (קיים ב-`src/lib/scope.ts:512`,
מחזיר client+session דרך safe-selects למזכירה, full למטפל/בעלים) בכל אתרי
ההחזרה של נתיבי הכתיבה. אתרי ה-`findUnique` הקיימים → שינוי ה-`include`; אתרים
שמחזירים את תוצאת ה-service/tx → re-fetch ממוסך לפי id לפני ההחזרה.

### Checklist

| # | אתר | קובץ:שורה (לפני) | סוג שינוי | סטטוס |
|---|-----|------------------|-----------|--------|
| 1 | POST success | `payments/route.ts:321` | re-fetch ממוסך | done |
| 2 | PUT prepareCardcom NO-OP | `payments/[id]/route.ts:217` | שינוי include | done |
| 3 | PUT ADDITIVE child | `payments/[id]/route.ts:290,295` | הסרת include מ-create + re-fetch | done |
| 4 | PUT REPLACE | `payments/[id]/route.ts:369` | שינוי include | done |
| 5 | PUT addPartialPayment | `payments/[id]/route.ts:408` | re-fetch ממוסך | done |
| 6 | PUT markFullyPaid | `payments/[id]/route.ts:445` | re-fetch ממוסך | done |
| 7 | PUT simple field update | `payments/[id]/route.ts:471` | שינוי include | done |

### בדיקת point 3 — payment-creator.ts

`createPaymentForSession` / `addPartialPayment` / `markFullyPaid` מחזירים את
ה-Payment עם client/session מלאים. **אין צורך לשנות** — השירות זקוק לנתונים
המלאים פנימית (שם/מייל הלקוח לקבלות ולמיילים), והמיסוך מתבצע בגבול ה-route
(re-fetch לפני ההחזרה ב-HTTP). ה-PHI הגולמי מהשירות לעולם לא מגיע לתשובת
המזכירה.

## מה לא נוגעים בו (עץ עבודה משותף — צ'אטים מקבילים)

נגענו **רק** ב:
- `src/app/api/payments/route.ts`
- `src/app/api/payments/[id]/route.ts`

לא נגענו ב-`scope.ts` (רק import של helper קיים), `prisma.ts`, `payment-creator.ts`,
`payments/page.tsx` (כולם מסומנים M ע"י צ'אטים מקבילים).

## אימות

- [x] `npx tsc --noEmit` נקי (EXIT=0)
- [x] eslint על 2 הקבצים נקי (EXIT=0)
- [x] security-review על הדלתא בלבד — 2 סוכנים אדוורסריאליים, שניהם ✅:
      שלמות סגירת הדליפה (כל 7 האתרים + 19 routes נסרקו) + רגרסיה/נכונות/טיפוסים.
- [x] frontend: סוכן Explore אימת שאף consumer לא קורא שדה קליני מהתשובה.
- [ ] **בדיקה חיה (נותר למשתמש)**: מזכירה עם canViewPayments יוצרת/מעדכנת תשלום →
      DevTools Network → אין `topic`/`notes`/`medicalHistory`/`initialDiagnosis` בתשובה.
- [ ] ⛔ **ממתין לאישור מפורש לפני push ל-main**.

## הערה על ה-frontend (סוכן Explore אימת)

אף consumer של POST/PUT `/api/payments` לא קורא שדה קליני מהתשובה. כולם קוראים
רק `id`, `receiptUrl`, `receiptNumber`, `receiptError`, `success`. המיסוך בטוח.
