# 2. seed race ב-feature flags

**מקור:** ביקורת Cursor — Stage 1.17, Bug 5
**עדיפות:** נמוכה (מקרה קצה נדיר מאוד)
**סטטוס:** פתוח

---

## מה הבעיה

בקובץ:

`src/app/api/admin/feature-flags/route.ts`

בשורות 47-50 יש את הקוד הבא:

```typescript
const count = await prisma.featureFlag.count();
if (count === 0) {
  await seedDefaultFlags(auth.session);
}
```

### תרחיש הבעיה

1. שרת Render עושה restart.
2. שני אדמינים נכנסים לדף ההגדרות **באותו שבריר שנייה**.
3. שתי הקריאות (GET) רואות `count === 0`.
4. שתיהן מנסות להריץ `seedDefaultFlags` במקביל.
5. ה-`upsert` הפנימי מציל את הראשונה — אבל השנייה **עלולה להיכשל** עם `unique violation` אם הראשונה לא הספיקה לעשות commit.

### למה זה לא קריטי

- צריך **שני אדמינים** שייכנסו **באותו רגע** מיד אחרי restart.
- במערכת לסטרטיסט עצמאי — **בלתי אפשרי** (אדמין יחיד).
- במערכת מרובת אדמינים — נדיר מאוד.

---

## פתרונות אפשריים

### פתרון 1 — הפשוט ביותר (מומלץ למימוש מהיר)
תפיסת ה-error והתעלמות:

```typescript
try {
  await seedDefaultFlags(auth.session);
} catch (e) {
  // race condition - אדמין שני הקדים. זה בסדר, הנתונים כבר זרועים.
  if (!isPrismaUniqueViolation(e)) throw e;
}
```

### פתרון 2 — נקי יותר
**PostgreSQL advisory lock** לפני ה-seed:

```typescript
await prisma.$executeRaw`SELECT pg_advisory_lock(${SEED_LOCK_ID})`;
try { /* seed */ } finally {
  await prisma.$executeRaw`SELECT pg_advisory_unlock(${SEED_LOCK_ID})`;
}
```

### פתרון 3 — הכי נקי (Stage 2.0)
העברת ה-seed ל-`prisma db seed` שרץ ב-build pipeline. ככה הוא רץ פעם אחת בלבד, לא בזמן ריצה.

---

## תנאי קבלה (Acceptance Criteria)

- [ ] בחירת פתרון (1 / 2 / 3)
- [ ] מימוש
- [ ] טסט שמדמה race (שתי קריאות מקבילות)
- [ ] אימות שאף קריאה לא נכשלת באופן קבוע
