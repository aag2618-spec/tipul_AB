// src/lib/dsar.ts
//
// DSAR — Data Subject Access Request (חוק הגנת הפרטיות §13 + GDPR Art 15).
//
// המטרה: ייצור payload מלא של כל המידע האישי שיש למערכת על מטופל יחיד, כולל
// פענוח שדות מוצפנים (PHI) ושליפה של DataAccessAuditLog (מי ניגש לרשומה).
//
// השימוש: דרך `POST /api/clients/[id]/export-personal-data`. ה-route אחראי על
// auth/scope/rate-limit; כאן עושים את ההרכבה.
//
// הפרדה: הלוגיקה מופרדת מהroute כדי לאפשר unit-test בעתיד וקריאה נקייה.

import JSZip from "jszip";
import { format } from "date-fns";
import prisma from "@/lib/prisma";
import { decryptDeep, decryptFields } from "@/lib/encrypted-fields";
import { buildClientWhere, type ScopeUser } from "@/lib/scope";

/**
 * Payload מובנה של DSAR. נשמר כ-`data.json` ב-ZIP, ומשמש גם לבניית הקובץ
 * הקריא לאדם (`data.txt`).
 *
 * שדות `Record<string, unknown>[]` במכוון כדי לא לקבע schema של Prisma —
 * אם תוסיף עמודה למודל, היא תופיע כאן אוטומטית בלי שינוי קוד.
 */
export interface DsarPayload {
  /** ISO8601 timestamp של זמן הייצוא */
  exportedAt: string;
  /** גרסת פורמט — לעדכון אם נשנה את ה-schema בעתיד */
  exportFormat: "DSAR-v1";
  /** ID של המטפל שביצע את הייצוא — לתיעוד */
  exportedByUserId: string;
  /** רשומת ה-Client עם כל השדות (מפוענחים) */
  client: Record<string, unknown>;
  /** רשומות נלוות — array per relation */
  therapySessions: Record<string, unknown>[];
  recordings: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  communicationLogs: Record<string, unknown>[];
  questionnaireResponses: Record<string, unknown>[];
  intakeResponses: Record<string, unknown>[];
  consentForms: Record<string, unknown>[];
  aiInsights: Record<string, unknown>[];
  therapeuticGoals: Record<string, unknown>[];
  emotionLogs: Record<string, unknown>[];
  clientTransferLogs: Record<string, unknown>[];
  clientDepartureChoices: Record<string, unknown>[];
  /** DataAccessAuditLog — מי ניגש לרשומה שלך (חוק הגנת הפרטיות §13).
   *  לא מפוענח (אין שדות מוצפנים בטבלה הזו). */
  dataAccessAuditLog: Record<string, unknown>[];
  /** סיכום ספירות — לטראגינג ולaudit log */
  counts: DsarCounts;
}

export interface DsarCounts {
  sessions: number;
  recordings: number;
  payments: number;
  documents: number;
  communications: number;
  questionnaires: number;
  intakes: number;
  consentForms: number;
  aiInsights: number;
  goals: number;
  emotionLogs: number;
  transferLogs: number;
  departureChoices: number;
  auditLogs: number;
}

/**
 * בונה את ה-payload המלא ל-DSAR. מחזיר `null` אם המטופל לא קיים או לא בscope
 * של המשתמש (ה-caller יחזיר 404).
 *
 * Side effects: אין. רק קריאה ל-DB.
 *
 * Throws: לא — שגיאות שליפה מטופלות ב-caller.
 *
 * @param clientId ID של המטופל לייצוא
 * @param scopeUser ScopeUser של המטפל שביצע את הבקשה (לאכיפת scope)
 */
export async function buildDsarPayload(
  clientId: string,
  scopeUser: ScopeUser
): Promise<DsarPayload | null> {
  const scopeWhere = buildClientWhere(scopeUser);

  // שליפה ראשית — כל ה-relations שיש להן @relation על Client.
  // ClientTransferLog ו-DataAccessAuditLog אין להם relation directe → נשלפים בנפרד.
  const client = await prisma.client.findFirst({
    where: { AND: [{ id: clientId }, scopeWhere] },
    include: {
      therapySessions: {
        include: {
          sessionNote: true,
          payment: true,
        },
        orderBy: { startTime: "desc" },
      },
      recordings: {
        include: {
          transcription: {
            include: { analysis: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      payments: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      communicationLogs: { orderBy: { createdAt: "desc" } },
      questionnaireResponses: {
        include: { template: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      intakeResponses: {
        include: { template: { select: { id: true, name: true } } },
        orderBy: { filledAt: "desc" },
      },
      consentForms: { orderBy: { createdAt: "desc" } },
      aiInsights: { orderBy: { createdAt: "desc" } },
      therapeuticGoals: { orderBy: { createdAt: "desc" } },
      emotionLogs: { orderBy: { recordedAt: "desc" } },
      departureChoices: { orderBy: { decidedAt: "desc" } },
    },
  });

  if (!client) return null;

  // פענוח כל השדות המוצפנים. אחרי תיקון round 17a, decryptDeep גם יורד
  // ל-intakeResponses ול-analysis.{keyTopics,emotionalMarkers,recommendations}
  // (שהם JSON-only encryption).
  decryptDeep("client", client);
  // Defensive: למרות ש-decryptDeep אמור לטפל ב-questionnaireResponses, ננציח
  // explicit decryption של array — מקרים שה-recursion לא תופס (template
  // מבלבל את ה-recursion עם פעולתו על שדות).
  if (Array.isArray((client as Record<string, unknown>).questionnaireResponses)) {
    decryptFields(
      "questionnaireResponse",
      (client as { questionnaireResponses: unknown[] }).questionnaireResponses
    );
  }

  // ClientTransferLog — אין @relation מ-Client; שליפה נפרדת.
  // snapshot fields (fromTherapistNameSnapshot/toTherapistNameSnapshot) חשובים
  // למקרה שמטפל נמחק אחרי ההעברה.
  const clientTransferLogs = await prisma.clientTransferLog.findMany({
    where: { clientId },
    orderBy: { transferredAt: "desc" },
  });

  // DataAccessAuditLog — דרישת DSAR החוקית: "מי ניגש לרשומה שלי".
  // מחזיר select מצומצם — לא חושפים meta (יכול להכיל data) ו-userAgent
  // (יכול להיות ארוך/לא רלוונטי).
  const dataAccessAuditLog = await prisma.dataAccessAuditLog.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userEmail: true,
      userName: true,
      recordType: true,
      recordId: true,
      action: true,
      ipAddress: true,
      createdAt: true,
    },
  });

  // הפרדה של ה-relations החוצה מהאובייקט המרכזי כדי לאפשר UI/JSON נקי.
  const clientObj = client as Record<string, unknown> & {
    therapySessions: Record<string, unknown>[];
    recordings: Record<string, unknown>[];
    payments: Record<string, unknown>[];
    documents: Record<string, unknown>[];
    communicationLogs: Record<string, unknown>[];
    questionnaireResponses: Record<string, unknown>[];
    intakeResponses: Record<string, unknown>[];
    consentForms: Record<string, unknown>[];
    aiInsights: Record<string, unknown>[];
    therapeuticGoals: Record<string, unknown>[];
    emotionLogs: Record<string, unknown>[];
    departureChoices: Record<string, unknown>[];
  };

  const {
    therapySessions,
    recordings,
    payments,
    documents,
    communicationLogs,
    questionnaireResponses,
    intakeResponses,
    consentForms,
    aiInsights,
    therapeuticGoals,
    emotionLogs,
    departureChoices,
    ...clientCore
  } = clientObj;

  const counts: DsarCounts = {
    sessions: therapySessions.length,
    recordings: recordings.length,
    payments: payments.length,
    documents: documents.length,
    communications: communicationLogs.length,
    questionnaires: questionnaireResponses.length,
    intakes: intakeResponses.length,
    consentForms: consentForms.length,
    aiInsights: aiInsights.length,
    goals: therapeuticGoals.length,
    emotionLogs: emotionLogs.length,
    transferLogs: clientTransferLogs.length,
    departureChoices: departureChoices.length,
    auditLogs: dataAccessAuditLog.length,
  };

  return {
    exportedAt: new Date().toISOString(),
    exportFormat: "DSAR-v1",
    exportedByUserId: scopeUser.id,
    client: clientCore,
    therapySessions,
    recordings,
    payments,
    documents,
    communicationLogs,
    questionnaireResponses,
    intakeResponses,
    consentForms,
    aiInsights,
    therapeuticGoals,
    emotionLogs,
    clientTransferLogs: clientTransferLogs as unknown as Record<string, unknown>[],
    clientDepartureChoices: departureChoices,
    dataAccessAuditLog: dataAccessAuditLog as unknown as Record<string, unknown>[],
    counts,
  };
}

/**
 * Json.stringify safe ל-Decimal / Date / BigInt:
 * - Decimal של Prisma → string
 * - Date → ISO string
 * - BigInt → string
 *
 * חיוני כי `JSON.stringify` ברירת מחדל זורק על BigInt ומחזיר Date כ-toISOString
 * (סדר בסדר) אבל Decimal מחזיר כ-object אטום.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  // Prisma Decimal יש לו toJSON או toString. בודקים שזה לא Date.
  if (
    typeof value === "object" &&
    !(value instanceof Date) &&
    !Array.isArray(value) &&
    "toFixed" in (value as object) &&
    typeof (value as { toFixed?: unknown }).toFixed === "function"
  ) {
    return String(value);
  }
  return value;
}

/**
 * בונה ZIP buffer מ-DsarPayload. מכיל:
 * - `data.json` — payload מלא ב-JSON
 * - `README.txt` — תיאור עברי קצר של מה יש בקובץ
 * - `client.txt` — סיכום קריא לאדם של פרטי המטופל + ספירות
 *
 * לא מחזיר את הקבצים הפיזיים של Documents (רק metadata + fileUrl) — fileUrl
 * נשמר ב-JSON כדי שהמטופל יוכל להוריד את הקבצים בנפרד אם רוצה.
 */
export async function serializeDsarToZip(
  payload: DsarPayload
): Promise<ArrayBuffer> {
  const zip = new JSZip();

  // 1. data.json — Machine-readable, מלא.
  const jsonStr = JSON.stringify(payload, jsonReplacer, 2);
  zip.file("data.json", jsonStr);

  // 2. README.txt — הסבר לאדם.
  const readme = buildReadme(payload);
  zip.file("README.txt", readme);

  // 3. client.txt — סיכום קריא לאדם.
  const clientTxt = buildClientSummary(payload);
  zip.file("client.txt", clientTxt);

  const buffer = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return buffer;
}

function buildReadme(payload: DsarPayload): string {
  return [
    "ייצוא מידע אישי — DSAR (Data Subject Access Request)",
    "═══════════════════════════════════════════════════════",
    "",
    `תאריך ייצוא: ${format(new Date(payload.exportedAt), "dd/MM/yyyy HH:mm")}`,
    `פורמט: ${payload.exportFormat}`,
    "",
    "מידע זה נמסר לך בהתאם לחוק הגנת הפרטיות (סעיף 13) וזכותך לעיין במידע",
    "אישי שלך השמור במערכת.",
    "",
    "תוכן הקובץ:",
    "─────────────",
    "  • data.json    — כל המידע במבנה מובנה (machine-readable JSON)",
    "  • client.txt   — סיכום קריא לאדם של פרטי המטופל ומסמכים נלווים",
    "  • README.txt   — הקובץ הזה",
    "",
    "סיכום כמותי:",
    "─────────────",
    `  • פגישות טיפול:           ${payload.counts.sessions}`,
    `  • הקלטות:                 ${payload.counts.recordings}`,
    `  • תשלומים:                ${payload.counts.payments}`,
    `  • מסמכים:                 ${payload.counts.documents}`,
    `  • תקשורת (מייל/SMS):       ${payload.counts.communications}`,
    `  • שאלוני הערכה:            ${payload.counts.questionnaires}`,
    `  • שאלוני אינטייק:          ${payload.counts.intakes}`,
    `  • טפסי הסכמה:              ${payload.counts.consentForms}`,
    `  • תובנות AI:               ${payload.counts.aiInsights}`,
    `  • מטרות טיפוליות:          ${payload.counts.goals}`,
    `  • לוג רגשות:               ${payload.counts.emotionLogs}`,
    `  • העברות בין מטפלים:       ${payload.counts.transferLogs}`,
    `  • בחירות בעת עזיבת מטפל:   ${payload.counts.departureChoices}`,
    `  • לוג גישה לרשומה שלך:     ${payload.counts.auditLogs}`,
    "",
    "הערות:",
    "──────",
    "  • הקבצים הפיזיים של מסמכים (PDF/תמונות) אינם כלולים בקובץ ZIP זה.",
    "    כתובות ה-URL לקבצים מופיעות ב-data.json תחת השדה 'documents'.",
    "  • שאלות / בקשות תיקון: יש לפנות למטפל/ת שלך.",
    "  • המידע סודי. שמרו על ה-ZIP במקום מאובטח.",
    "",
  ].join("\n");
}

function buildClientSummary(payload: DsarPayload): string {
  const c = payload.client;
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "לא צוין";
    if (v instanceof Date) return format(v, "dd/MM/yyyy");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return [
    "פרטי מטופל — סיכום קריא",
    "═══════════════════════════",
    "",
    `שם:               ${fmt(c.name)}`,
    `שם פרטי:           ${fmt(c.firstName)}`,
    `שם משפחה:          ${fmt(c.lastName)}`,
    `טלפון:             ${fmt(c.phone)}`,
    `אימייל:            ${fmt(c.email)}`,
    `תאריך לידה:        ${fmt(c.birthDate)}`,
    `כתובת:             ${fmt(c.address)}`,
    `סטטוס:             ${fmt(c.status)}`,
    `יתרת קרדיט:        ${fmt(c.creditBalance)}`,
    `הסכמה לעיבוד AI:   ${fmt(c.consentToAI)}`,
    "",
    "תוכן קליני:",
    "────────────",
    "אבחנה ראשונית:",
    fmt(c.initialDiagnosis),
    "",
    "הערות אינטייק:",
    fmt(c.intakeNotes),
    "",
    "הערות כלליות:",
    fmt(c.notes),
    "",
    "הערות גישה טיפולית:",
    fmt(c.approachNotes),
    "",
    "הקשר תרבותי:",
    fmt(c.culturalContext),
    "",
    "ניתוח מקיף:",
    fmt(c.comprehensiveAnalysis),
    "",
    "היסטוריה רפואית:",
    fmt(c.medicalHistory),
    "",
    "═══════════════════════════════════════════════════════════════════",
    "כל יתר המידע (פגישות, הקלטות, תמלולים, שאלונים, תקשורת, לוג גישה)",
    "נמצא בקובץ data.json במבנה מובנה.",
    "═══════════════════════════════════════════════════════════════════",
  ].join("\n");
}

/**
 * Helper לlogging: מחזיר אובייקט קומפקטי של counts ל-audit log.
 * משמש את ה-route לעדכון `logDataAccess(meta:...)`.
 */
export function dsarCountsForAudit(payload: DsarPayload): DsarCounts {
  return payload.counts;
}
