# 3. מנגנון refund לקרדיטים — ✅ בוצע ונדחף לפרודקשן

**מקור:** ביקורת Cursor — Stage 1.17, M-Refund
**עדיפות:** הייתה **חובה (BLOCKING)** — ללא זה אסור היה להפעיל את ה-feature flags
**סטטוס:** ✅ **בוצע ונדחף — קומיט `a1be262` (26.4.2026)**

---

## ⚡ סטטוס נוכחי

**הושלם במלואו:**

- ✅ קוד נכתב על ידי הצאט המקביל (Claude Code Opus)
- ✅ 6 טסטים חדשים נוספו (18 טסטי credits עוברים, סך הכל 210+ במערכת)
- ✅ TypeScript נקי
- ✅ Build נקי
- ✅ ביקורת 5 סוכנים של הצאט המקביל — 0 BLOCKERs
- ✅ ביקורת 5 סוכנים של צאט הדחיפה (8.5/10 ממוצע) — 0 BLOCKERs
- ✅ **נדחף לפרודקשן** בקומיט `a1be262` (26.4.2026)

**קובץ ביקורת מלא:** `c:\Users\User\Downloads\ביקורת Cursor - Stage 1.17.2 refund.md`

---

## מה הייתה הבעיה (לפני התיקון)

ב-`consumeSms` וב-`consumeAiAnalysis`:
- הקרדיט יורד מהמשתמש **לפני** הקריאה ל-API חיצוני (Pulseem ל-SMS, Gemini ל-AI).
- אם ה-API נכשל אחרי שהקרדיט כבר ירד — **המשתמש איבד קרדיט בלי לקבל שירות.**

זה היה חוסם הפעלה של ה-feature flags החדשים (`USE_NEW_CONSUME_SMS`, `USE_NEW_CONSUME_AI`).

---

## מה תוקן (3 קבצים)

### `src/lib/credits.ts`
- נוספו פונקציות `refundSms` ו-`refundAiAnalysis` שמחזירות בדיוק את הסכום שירד.
- `ConsumeResult` הורחב עם `month` ו-`year` (זמן ה-consume) — כדי למנוע בעיה בחציית גבול חודש.
- `packagesTouched` שונה מ-`string[]` ל-`Array<{id, amount}>` כדי שה-refund יידע כמה להחזיר לכל חבילה.
- `validateReceipt` מגן מפני receipts זדוניים (negative amounts).

### `src/lib/sms.ts`
- אחרי `consumeSms` שומרים את ה-receipt.
- אם ה-API נכשל בכל אחד מ-3 הנתיבים (response.ok=false / status!=Success / catch) — קוראים ל-refund לפני שמחזירים שגיאה.
- אם גם ה-refund נכשל — נוצר **AdminAlert URGENT** עם כל הפרטים.

### `src/app/api/ai/session/analyze/route.ts`
- אותו דפוס לניתוח AI.

### `src/lib/__tests__/credits.test.ts`
- 6 טסטי refund חדשים.

---

## מה עוד צריך לעשות

- [x] ~~**push** של הקומיט הזה לפרודקשן~~ — ✅ **נדחף 26.4.2026, קומיט `a1be262`**
- [ ] **שבוע שקט** עם ה-flags עדיין כבויים (כדי לוודא שלא שברנו את ה-wire-up עצמו)
- [ ] **רק אז** — להפעיל `USE_NEW_CONSUME_SMS=true` (האם להפעיל גם AI? תלוי בהחלטת limits — ראה למטה)

---

## שאלה עסקית פתוחה — לפני flip של AI flag

**הבדל בין legacy ל-new:**
- Legacy: ENTERPRISE = 20 ניתוחים בחודש
- New: ENTERPRISE = 50 ניתוחים בחודש

**אתה צריך להחליט:** האם להעלות את התקרה ל-50, או להוריד את ההגדרה החדשה ל-20?

---

## איך לסגור את החוב

אחרי ש-Cursor (או צ'אט אחר) ידחוף את הקומיט הזה לפרודקשן —
- שנה את הסטטוס בקובץ הזה ל-"✅ בוצע ונדחף בקומיט XXX"
- הזז את הקובץ לתיקייה `docs/חוב-טכני/בוצע/` (אם תרצה לשמור היסטוריה)
