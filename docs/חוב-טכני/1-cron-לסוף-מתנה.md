# 1. cron נפרד לחסימה אוטומטית בסוף מתנה

**מקור:** ביקורת Cursor — Stage 1.17, Bug 4
**עדיפות:** בינונית
**סטטוס:** פתוח

---

## מה הבעיה

ה-cron הקיים בשם `trial-expiry` חוסם רק משתמשים שעונים לשני התנאים גם יחד:
- `subscriptionStatus: "TRIALING"` (במצב ניסיון)
- `trialEndsAt < now` (תאריך סיום הניסיון עבר)

**הוא מתעלם משני מקרים:**

1. **משתמש עם מתנה (`isFreeSubscription: true`)** שתאריך סיום המתנה (`subscriptionEndsAt`) שלו עבר.
2. **משתמש פעיל (`subscriptionStatus: "ACTIVE"`)** שתאריך סיום המנוי שלו עבר (Cardcom נכשל לחדש).

**תוצאה:** "מתנה" של 30 יום חינם **לא נחסמת אוטומטית** כשנגמרת. המשתמש ממשיך להשתמש במערכת בחינם עד שמישהו שם לב ידנית.

---

## למה זה לא קריטי כרגע

- אם נותנים **מעט** מתנות — בעיה זניחה.
- אם נותנים **הרבה** מתנות (פתיחת בטא לעשרות משתמשים, למשל) — מאבדים כסף.

---

## פתרון מוצע

יצירת cron חדש בנתיב `/api/cron/subscription-ended` (או הרחבת ה-cron הקיים `trial-expiry`):

### תנאי קבלה (Acceptance Criteria)

- [ ] cron חדש בשם `/api/cron/subscription-ended` או הרחבה של `trial-expiry`
- [ ] מטפל ב-`isFreeSubscription: true` + `subscriptionEndsAt < now`
- [ ] מטפל ב-`subscriptionStatus: "ACTIVE"` + `subscriptionEndsAt < now`
- [ ] עטוף ב-`withAudit` עם forensic snapshot (תיעוד למה נחסם)
- [ ] שולח מייל למשתמש (הודעה על סיום המנוי) + מייל לאדמין

---

## הקשר רחב

המאסטר של הפרויקט הבטיח **"Back-door closures"** — חסימה אוטומטית של דרכים אחוריות שמאפשרות שימוש לאחר תום המנוי. זה לא ממומש עדיין.
