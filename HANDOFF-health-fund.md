# HANDOFF — קופת חולים והתחייבויות

## מה הושלם ✅

### תשתית (DB + API + UI)
- **Prisma schema**: שדה `healthFund` (HealthInsurer enum, nullable) על Client + מודל `ClientCommitment` + enum `CommitmentStatus`
- **Migration**: `prisma/migrations/20260527100000_add_client_health_fund_and_commitments/migration.sql` — idempotent SQL (IF NOT EXISTS)
- **Zod validation**: `src/lib/validations/client.ts` — סכמות create/update commitment עם date range validation
- **API routes**: 
  - `src/app/api/clients/route.ts` POST — healthFund ב-create
  - `src/app/api/clients/[id]/route.ts` PUT — healthFund ב-update
  - `src/app/api/clients/[id]/commitments/route.ts` — GET/POST
  - `src/app/api/clients/[id]/commitments/[commitmentId]/route.ts` — GET/PUT/DELETE + audit logging
- **UI**:
  - Dropdown קופת חולים בטופס יצירה ועריכה
  - Badge קופה בפרופיל מטופל (Quick Info Bar) + ברשימת מטופלים
  - קומפוננטת `CommitmentManagement` בדף עריכה (דיאלוג, progress bar, CRUD)
- **ייצוא**: healthFund + commitments ב-ZIP export וב-DSAR
- **scope.ts**: `healthFund: true` ב-`getClientSafeSelectForSecretary()`
- **audit-logger.ts**: `CLIENT_COMMITMENT` ב-AuditRecordType

### באגים שתוקנו
- `type="button"` על כל כפתורי CommitmentManagement (מנע form submit)
- copaymentAmount=0 לא נבלע ל-null
- endDate >= startDate validation
- Responsive בדיאלוג תאריכים (grid-cols-1 sm:grid-cols-3)
- Defense-in-depth: WHERE clauses עם clientId ב-update/delete

### Commits
- `fc33bd1f` — פיצ'ר ראשי
- `ce9de3eb` — badge בגריד רשימת מטופלים
- `ddeb03f9` — migration SQL
- `847a1bf3` — migration idempotent
- `5600fa51` — type=button fix

---

## מה נשאר לעשות 🔧

### 1. Deploy ב-Render — migration כושלת (דחוף!)

**הבעיה**: ה-migration נכשלה כי `CommitmentStatus` enum כבר היה בDB (נוצר ע"י צ'אט אחר).
ה-SQL תוקן להיות idempotent, אבל ב-DB יש רשומה failed ב-`_prisma_migrations`.

**הפתרון**: המשתמש עדכן את ה-Build Command ב-Render Dashboard להוסיף:
```
(npx prisma migrate resolve --rolled-back 20260527100000_add_client_health_fund_and_commitments 2>/dev/null || true)
```
**לפני** `npx prisma migrate deploy`.

⚠️ **אחרי שה-deploy יצליח פעם אחת** — להחזיר את ה-build command למקורי (להסיר את שורת ה-resolve).

### 2. ספירת טיפולים אוטומטית (usedSessions++) — הפיצ'ר העיקרי שחסר

**מה צריך**: כשפגישה מסומנת כ-COMPLETED, אם ללקוח יש התחייבות פעילה (status=ACTIVE), לעלות usedSessions ב-1.

**איפה לשנות**: `src/app/api/sessions/[id]/route.ts` — בפונקציית PUT, באזור שמטפל ב-`status === "COMPLETED"` (סביב שורות 370-410). אחרי יצירת Payment:

```typescript
// Increment usedSessions on active commitment
if (therapySession.clientId) {
  await prisma.clientCommitment.updateMany({
    where: {
      clientId: therapySession.clientId,
      status: "ACTIVE",
    },
    data: {
      usedSessions: { increment: 1 },
    },
  });
}
```

### 3. השתתפות עצמית בדיאלוג סיום פגישה (הפיצ'ר הכי חשוב למשתמש!)

**מה צריך**: כשנפתח דיאלוג "סיום פגישה" (`src/components/sessions/complete-session-dialog.tsx`), אם ללקוח יש התחייבות פעילה:
- הסכום לתשלום = `copaymentAmount` מההתחייבות (למשל 50₪) **במקום** `session.price` (למשל 320₪)
- להציג הודעה "קופת חולים: כללית | השתתפות עצמית: 50₪"

**איך לממש**:
1. **בקומפוננטה** (client-side): כשהדיאלוג נפתח (`useEffect` על `isOpen`), לעשות fetch ל:
   ```
   GET /api/clients/${clientId}/commitments
   ```
   ולחפש commitment עם `status === "ACTIVE"`.

2. **אם נמצאה התחייבות פעילה**:
   - `setAmount(commitment.copaymentAmount.toString())` במקום `defaultAmount`
   - להציג badge/הודעה שמראה שזו השתתפות עצמית

3. **interface של session** צריך להכיל `client.id` — כבר קיים.

**קבצים רלוונטיים**:
- `src/components/sessions/complete-session-dialog.tsx` — הדיאלוג הראשי
- `src/app/api/sessions/[id]/route.ts` — PUT handler (שורות 370-410)
- `src/app/api/clients/[id]/commitments/route.ts` — GET commitments API

### 4. (אופציונלי) אייקון קופ"ח ברשימת מטופלים
הקוד כבר מציג אייקון Stethoscope + שם קופה בגריד. אם לא מופיע — ייתכן שצריך לוודא שה-migration רצה ושנבחרה קופה למטופל.

---

## קבצים מרכזיים

| קובץ | תפקיד |
|-------|--------|
| `prisma/schema.prisma` | Client.healthFund + ClientCommitment model |
| `src/lib/validations/client.ts` | Zod schemas (create/update commitment) |
| `src/app/api/clients/[id]/commitments/route.ts` | GET/POST commitments |
| `src/app/api/clients/[id]/commitments/[commitmentId]/route.ts` | GET/PUT/DELETE commitment |
| `src/components/clients/commitment-management.tsx` | UI ניהול התחייבויות |
| `src/components/sessions/complete-session-dialog.tsx` | **לשנות** — השתתפות עצמית |
| `src/app/api/sessions/[id]/route.ts` | **לשנות** — usedSessions++ |
| `src/components/clients/clients-grid-with-search.tsx` | badge קופה בגריד |

---

## כללי עבודה (חובה!)

- עבודה ישירה על main, לא ענפים
- `git add` רק קבצים ספציפיים (יש צ'אטים מקבילים)
- לפני push: 5 סוכני ביקורת + 2 סוכני אבטחה, הלוך-חזור עד נקי
- Hebrew UI בכל מקום
- logger לא console
- force-dynamic על כל API route
- requireAuth → loadScopeUser → buildClientWhere → action
