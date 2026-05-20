# 🔐 HANDOFF — סבב אבטחה 17 (Compliance רגולטורי)

**תאריך התחלה:** 2026-05-20
**מסמך קודם:** `HANDOFF-security-round16.md`
**הוראות:** `c:\Users\User\Downloads\הוראות לצאט חדש - אבטחה סבב 17.md`

---

## 🎯 מטרת הסבב

החזרת תאימות חוקית למערכת PHI — חוק הגנת הפרטיות + GDPR + חוק זכויות החולה.

**זה לא תיקון פריצות. אלה דרישות חוק על מערכת רפואית.**

---

## 📋 Checklist הסבב

| # | מ-`R` | פריט | Status | Commit |
|---|--------|--------|--------|--------|
| 17a | R1 | DSAR endpoint (`POST /api/clients/[id]/export-personal-data`) | **in_progress** | — |
| 17b | R2 | Right to be Forgotten (`DELETE /api/clients/[id]/erase-personal-data`) | pending | — |
| 17c | R3 | Anonymization של AI requests (Gemini PII redaction) | pending | — |
| 17d | R4 | DPA חתימה — Resend/Google/Render/Cardcom | **משימה ידנית** (לא קוד) | — |
| 17e | R5 | Breach Notification Workflow (טבלה + UI) | pending | — |
| 17f | R6 | Data Retention Policy + Auto-Deletion (cron) | pending | — |

**הסבב מתחיל ב-17a (DSAR) — שלאר ידחו ל-HANDOFF הבא או יטופלו ברצף אם יש זמן.**

---

## 🟠 17a — R1 — DSAR Endpoint

### דרישה חוקית
חוק הגנת הפרטיות §13: **מטופל זכאי לקבל כל מידע אישי שלו במערכת**.
GDPR Art 15 — Right of Access.

### ההחלטה האדריכלית

**יצירת endpoint חדש** (לא להחליף את `/api/clients/[id]/export` הקיים):
- ה-`export` הקיים מייצר ZIP חלקי (TXT בלבד, **בלי decryptDeep!** — באג שיתוקן ב-DSAR החדש)
- ה-`export-personal-data` החדש = formal DSAR, מלא, JSON+TXT, כולל communications, intake, audit log

**שם הroute:** `POST /api/clients/[id]/export-personal-data`
- POST (לא GET) כי זו פעולה רגישה שצריך לתעד audit + state-changing semantically (לא מטמין).
- מוגן rate-limit (`EXPORT_RATE_LIMIT` = 3/שעה).

### סדר הchecks (לפי `feedback_security_fixes.md` חוק 3)

1. `requireAuth()` — auth
2. `loadScopeUser(userId)` — scope
3. `isSecretary(scopeUser)` → 403 (תיק קליני אסור למזכירה)
4. `checkRateLimit('dsar-export:${userId}', EXPORT_RATE_LIMIT)`
5. `buildClientWhere(scopeUser)` + `prisma.client.findFirst` עם `AND: [{id}, scopeWhere]`
6. אם לא נמצא → 404 ("מטופל לא נמצא")
7. שליפת כל הnested relations + DataAccessAuditLog (חיפוש לפי clientId)
8. `decryptDeep("client", clientWithRelations)` — פענוח מלא
9. בניית payload JSON + טקסט קריא + ZIP
10. `logDataAccess({ action: "EXPORT", recordType: "CLIENT_PROFILE", meta: { exportType: "DSAR", ... } })`
11. החזרת ZIP עם `Content-Disposition` (sanitizeDownloadFilename לשם המטופל)

### מודלים שייוצאו (לפי R1 + scan של schema)

**ישיר Client.relations:**
- `Client` (כולל medicalHistory + notes + initialDiagnosis + intakeNotes + approachNotes + culturalContext + comprehensiveAnalysis — כולם encrypted)
- `TherapySession[]` (כולל topic, notes — encrypted)
- `SessionNote` (via session) — content + aiAnalysis (encrypted)
- `Recording[]` → `Transcription` (content encrypted) → `Analysis` (summary + JSON fields encrypted)
- `Payment[]`
- `Document[]` (metadata בלבד — קבצים יכולים להיות גדולים; URLs נכללים)
- `CommunicationLog[]` (subject + content + errorMessage — encrypted)
- `QuestionnaireResponse[]` (answers JSON + aiAnalysis — encrypted)
- `IntakeResponse[]` (responses JSON — encrypted)
- `ConsentForm[]`
- `AIInsight[]`
- `TherapeuticGoal[]`
- `EmotionLog[]`
- `ClientTransferLog[]`
- `ClientDepartureChoice[]`

**נפרד (חיפוש לפי clientId):**
- `DataAccessAuditLog[]` — **דרישה חוקית של DSAR: מטופל זכאי לדעת מי ניגש לרשומה שלו**

**לא נכלל (decision):**
- `SavedCardToken.token` — token של Cardcom. **מוחרג**: הוא לא PHI של המטופל; הוא secret של מערכת התשלומים. גילוי = security incident. נכלל רק metadata (last4, cardHolder, isActive).
- `CardcomInvoice` — נכלל metadata (סכום, תאריך, מספר חשבונית) אבל לא secrets פנימיים של Cardcom.

### Helper חדש

`src/lib/dsar.ts` — מייצא:
- `buildDsarPayload(clientId, scopeUser): Promise<DsarPayload>` — שליפה + פענוח + הרכבה
- `serializeDsarToZip(payload): Promise<ArrayBuffer>` — JSZip builder עם JSON + TXT + מטא

מפריד את ה-logic מה-route כדי לשמור על קריאות + יכולת unit-test.

### Audit

`logDataAccess` עם:
```ts
{
  userId,
  recordType: "CLIENT_PROFILE",
  recordId: clientId,
  action: "EXPORT",
  clientId,
  request,
  meta: {
    exportType: "DSAR",
    sessionCount, communicationCount, intakeCount,
    questionnaireCount, paymentCount, documentCount, auditLogCount
  }
}
```

`recordType` קיים כבר (`AuditRecordType` ב-`audit-logger.ts:21-30`).
`action: "EXPORT"` קיים כבר. אין שינוי schema.

### בדיקות תקינות לפני commit

- `npx tsc --noEmit` נקי
- `npx vitest run` — אין failures חדשים (3 pre-existing ב-impersonation + 3 DB-required)
- בדיקה ידנית: ה-route עובד עם client אמיתי בdev?

### בדיקות אבטחה (5 סוכנים pre-push)

1. **Auth/2FA/reset** — לא נגעתי. שינוי בודד = route חדש.
2. **Payments/Cardcom/Webhooks** — לא נגעתי. ה-route לא מבצע פעולת תשלום.
3. **AI Pipeline + Scope + Cron + Audit** — קריטי: סדר checks, decryptDeep, audit log.
4. **Build + TS + Tests** — חובה.
5. **Code quality** — T3 stack, logger, force-dynamic, עברית UI.

---

## 🟡 17b — R2 — Right to be Forgotten (נדחה)

יידחה ל-handoff הבא או יטופל אחרי 17a במידה שיש זמן.

**שאלות פתוחות:**
- האם soft-delete (`deletedAt`) או hard-delete?
- crypto-shred של מפתח-לרשומה — לא נתמך כיום (key אחד גלובלי).
- backups של Render — 7 ימים, לא ניתן למחוק.
- Audit logs — לא נמחקים (חוק זכויות החולה 25 שנה).

---

## 🟡 17c — R3 — AI PII Anonymization (נדחה)

יידחה. דורש עיצוב מקיף (regex של ת"ז ישראלית, שמות בעברית, טלפונים, כתובות).

---

## 🟡 17d — R4 — DPA (משימה ידנית של המשתמש)

לא קוד. רשימה למשתמש:
- Resend DPA: https://resend.com/dpa
- Google Cloud DPA (Gemini)
- Render DPA: https://render.com/legal/dpa
- Cardcom DPA לנתוני תשלום

---

## 🟡 17e — R5 — Breach Notification (נדחה)

דורש טבלת `BreachIncident` חדשה + UI ב-`/admin` + email automation. ייעוץ משפטי.

---

## 🟡 17f — R6 — Data Retention (נדחה)

cron יומי שמוחק רשומות ישנות מהגבולות.

---

## 📌 פעולות ידניות שעדיין ממתינות (מ-HANDOFFs קודמים)

מ-HANDOFF 16:
1. **Cardcom env vars** ב-Render Dashboard (11 משתנים — ראה `memory/project_cardcom_env_vars_pending.md`)
2. **`prisma migrate deploy`** — מעבר מ-`db push`. דורש גיבוי DB + Render Shell.

---

## 🧪 Lessons Learned ל-HANDOFF הבא

- **בדיקת decryptDeep ב-exports קיימים**: ה-`/api/clients/[id]/export` הקיים **לא קורא ל-decryptDeep** → ZIP נשלח עם תוכן מוצפן (`{__enc__: ...}`). זה באג שצריך לתקן במקביל (אבל לא ב-DSAR — שם זה route חדש שעושה את זה נכון).
- **DSAR לא רק כלל הנתונים**: זכות חוקית כוללת גם **"מי ניגש לרשומה שלי"** — DataAccessAuditLog חייב להיכלל.
- **POST ולא GET**: ל-exports רגישים — מונע ייצוא בטעות מ-link click, מאפשר audit נקי.

---

**מסמך זה ימשיך להתעדכן במהלך הסבב.** 🔒
