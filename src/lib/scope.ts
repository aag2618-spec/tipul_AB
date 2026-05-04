// ==================== Clinic Multi-Tenancy Scope ====================
// שכבת הרשאות מרכזית לסינון נתונים לפי תפקיד המשתמש בארגון.
//
// דפוס שימוש:
//   const where = await getVisibleClientWhere(userId);
//   const clients = await prisma.client.findMany({ where });
//
// הפונקציה הזאת ה-source of truth להרשאות מטופלים. ב-Server Components ו-API
// routes שכרגע מסננים לפי `therapistId`, יש לעבור לסינון דרך הפונקציה הזאת
// כדי לתמוך בקליניקות רב-מטפלים בלי לשבור מטפלים עצמאיים.

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

// ============================================================================
// Types
// ============================================================================

/**
 * שדות מינימליים על המשתמש שנדרשים להחלטות הרשאה.
 * אנו מקבלים את זה כקלט (במקום לעשות query בכל קריאה) כדי לאפשר caching ב-API
 * routes שכבר טוענים את ה-User לבדיקת auth.
 */
export type ScopeUser = {
  id: string;
  role: "USER" | "MANAGER" | "ADMIN" | "CLINIC_OWNER" | "CLINIC_SECRETARY";
  organizationId: string | null;
  clinicRole: "OWNER" | "THERAPIST" | "SECRETARY" | null;
  secretaryPermissions: SecretaryPermissions | null;
};

/**
 * מטריצת הרשאות מזכירה — JSON שנשמר ב-User.secretaryPermissions.
 * שדות boolean. true = מותר. ברירת מחדל ל-false (deny by default).
 *
 * הגישה לתוכן קליני (סיכומים/אבחנות/ניתוחי AI/הקלטות/answers של שאלון) חסומה
 * קשיחות בקוד — לא ניתנת לעריכה דרך השדה הזה. ראה CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.
 */
export type SecretaryPermissions = {
  canViewPayments?: boolean; // צפייה בתשלומים והיסטוריה
  canIssueReceipts?: boolean; // הוצאת קבלות (Cardcom)
  canSendReminders?: boolean; // שליחת תזכורות SMS/Email
  canCreateClient?: boolean; // יצירת מטופל חדש
  canViewDebts?: boolean; // צפייה בחובות
  canViewStats?: boolean; // צפייה בסטטיסטיקות עסקיות
  canViewConsentForms?: boolean; // צפייה בטפסי הסכמה (אדמיניסטרטיבי)
};

// ============================================================================
// Constants — הרשאות קשיחות לחסימה למזכירה
// ============================================================================

/**
 * שדות קליניים החסומים למזכירה — ללא יוצא מן הכלל. גישה אסורה לפי הדין הישראלי
 * (חוק הפסיכולוגים, חוק זכויות החולה) — מידע רפואי-נפשי מוגן ברמת המטפל בלבד.
 *
 * השימוש: ב-`select` לקריאת Client/TherapySession וכו', יש להחריג את השדות
 * האלה למזכירה. ראה getClinicalFieldsBlocked.
 */
export const CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY = {
  // שדות קליניים על Client — לא ייכללו ב-safe select למזכירה.
  // כולל תוכן חופשי של המטפל (notes/intakeNotes/initialDiagnosis), היסטוריה רפואית,
  // הקשר תרבותי/גישה טיפולית, וניתוחי AI מקיפים.
  client: [
    "notes",
    "intakeNotes",
    "initialDiagnosis",
    "medicalHistory",
    "therapeuticApproaches",
    "approachNotes",
    "culturalContext",
    "comprehensiveAnalysis",
    "comprehensiveAnalysisAt",
  ] as const,
  // שדות קליניים על TherapySession — `notes` הוא סיכום חופשי של המטפל.
  // `topic` (נושא הפגישה) גם נחשב תוכן קליני ומוחרג ב-safe select.
  session: ["notes", "topic"] as const,
  // מודלים שלמים שמזכירה לא רואה כלל — גישה חסומה בקוד, אסור לעקוף דרך
  // secretaryPermissions. QuestionnaireResponse חסום כי `answers` הוא תוכן
  // קליני גולמי; אם בעתיד צריך metadata בלבד (totalScore/status) יש לחשוף
  // דרך helper ייעודי ולא דרך קריאה ישירה למודל.
  blockedModels: [
    "SessionNote",
    "SessionAnalysis",
    "QuestionnaireAnalysis",
    "QuestionnaireResponse",
    "Recording",
    "Transcription",
    "AIInsight",
  ] as const,
};

/**
 * שם מודל קליני החסום למזכירה. נגזר מ-blockedModels כדי שהוא וה-type יישארו בסנכרון.
 */
export type ClinicalModel =
  (typeof CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.blockedModels)[number];

// ============================================================================
// Pure helpers — בלי Prisma, נוחים ל-unit testing
// ============================================================================

/**
 * האם המשתמש הוא מזכיר/ה? (clinicRole=SECRETARY).
 * שימוש: דלגים מסכי מזכירה / חסימת תוכן קליני.
 */
export function isSecretary(user: ScopeUser): boolean {
  return user.clinicRole === "SECRETARY" || user.role === "CLINIC_SECRETARY";
}

/**
 * האם המשתמש הוא בעל/ת קליניקה? (clinicRole=OWNER או role=CLINIC_OWNER).
 */
export function isClinicOwner(user: ScopeUser): boolean {
  return user.clinicRole === "OWNER" || user.role === "CLINIC_OWNER";
}

/**
 * האם המשתמש הוא מטפל/ת בקליניקה? (לא בעלים, לא מזכירה).
 */
export function isClinicTherapist(user: ScopeUser): boolean {
  return user.clinicRole === "THERAPIST" && user.organizationId !== null;
}

/**
 * האם המשתמש שייך לארגון/קליניקה? (כל clinicRole).
 */
export function isOrgMember(user: ScopeUser): boolean {
  return user.organizationId !== null;
}

/**
 * בודק אם מזכירה מורשית לפעולה ספציפית, לפי המטריצה ב-secretaryPermissions.
 * ל-non-secretary תמיד מחזיר true (הם לא מוגבלים על-ידי המטריצה).
 *
 * @example
 *   if (!secretaryCan(user, "canSendReminders")) {
 *     return forbidden("מזכירה לא מורשית לשלוח תזכורות");
 *   }
 */
export function secretaryCan(
  user: ScopeUser,
  permission: keyof SecretaryPermissions
): boolean {
  if (!isSecretary(user)) return true;
  return Boolean(user.secretaryPermissions?.[permission]);
}

/**
 * חוסם בקוד גישה למודלים קליניים — בלי קשר ל-secretaryPermissions.
 * זה ה-hard-stop. אסור לשנות בלי ייעוץ משפטי.
 */
export function canSecretaryAccessModel(
  user: ScopeUser,
  modelName: string
): boolean {
  if (!isSecretary(user)) return true;
  return !CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.blockedModels.some(
    (blocked) => blocked === modelName
  );
}

// ============================================================================
// Where-clause builders (Prisma) — pure, על בסיס ScopeUser בלבד
// ============================================================================

/**
 * מחזיר Prisma where clause למטופלים הנגישים למשתמש.
 *
 * החלטות לפי תפקיד:
 * - מטפל עצמאי (organizationId=null): רק המטופלים שלו (`therapistId=user.id`).
 * - בעלת קליניקה (OWNER): כל המטופלים בארגון.
 * - מטפלת בקליניקה (THERAPIST): המטופלים שלה בארגון בלבד.
 * - מזכירה (SECRETARY): כל המטופלים בארגון (אבל הקוד שקורא חייב להחיל
 *   `select` שמסיר שדות קליניים — ראה getClientSafeSelectForSecretary).
 * - ADMIN/MANAGER גלובליים: where ריק (רואים הכל). שימוש זהיר!
 */
export function buildClientWhere(user: ScopeUser): Prisma.ClientWhereInput {
  if (user.role === "ADMIN" || user.role === "MANAGER") {
    return {};
  }

  if (!user.organizationId) {
    return { therapistId: user.id };
  }

  if (isClinicOwner(user) || isSecretary(user)) {
    return { organizationId: user.organizationId };
  }

  if (isClinicTherapist(user)) {
    return {
      organizationId: user.organizationId,
      therapistId: user.id,
    };
  }

  // נפילה בטוחה: רואה רק את עצמו (deny by default)
  return { therapistId: user.id };
}

/**
 * מחזיר Prisma where clause לפגישות הנגישות למשתמש.
 * מבוסס על buildClientWhere — פגישות נגזרות מהמטופל.
 */
export function buildSessionWhere(user: ScopeUser): Prisma.TherapySessionWhereInput {
  if (user.role === "ADMIN" || user.role === "MANAGER") {
    return {};
  }

  if (!user.organizationId) {
    return { therapistId: user.id };
  }

  if (isClinicOwner(user) || isSecretary(user)) {
    return { organizationId: user.organizationId };
  }

  if (isClinicTherapist(user)) {
    return { organizationId: user.organizationId, therapistId: user.id };
  }

  return { therapistId: user.id };
}

/**
 * מחזיר Prisma where clause לתשלומים הנגישים למשתמש.
 * מזכירה רואה תשלומים רק אם canViewPayments=true.
 */
export function buildPaymentWhere(user: ScopeUser): Prisma.PaymentWhereInput | { id: "__deny__" } {
  if (isSecretary(user) && !secretaryCan(user, "canViewPayments")) {
    // מזכירה ללא הרשאת תשלומים — מחזיר filter שלא מתאים לאף רשומה
    return { id: "__deny__" };
  }

  if (user.role === "ADMIN" || user.role === "MANAGER") {
    return {};
  }

  if (!user.organizationId) {
    return { client: { therapistId: user.id } };
  }

  if (isClinicOwner(user) || isSecretary(user)) {
    return { organizationId: user.organizationId };
  }

  if (isClinicTherapist(user)) {
    return { organizationId: user.organizationId, client: { therapistId: user.id } };
  }

  return { client: { therapistId: user.id } };
}

/**
 * מחזיר Prisma where clause למסמכים הנגישים למשתמש.
 *
 * Document עם `clientId` מסונן דרך הקליינט (תורש את ה-scope של המטופל).
 * Document בלי clientId (template / general) מסונן לפי בעלות:
 * - מטפל עצמאי: `therapistId=user.id`.
 * - בעל קליניקה / מזכירה: `organizationId=user.organizationId`.
 * - מטפלת בקליניקה: `therapistId=user.id` (המסמכים האישיים שלה בלבד).
 */
export function buildDocumentWhere(user: ScopeUser): Prisma.DocumentWhereInput {
  if (user.role === "ADMIN" || user.role === "MANAGER") {
    return {};
  }

  const clientWhere = buildClientWhere(user);

  if (!user.organizationId) {
    return {
      OR: [
        { client: clientWhere },
        { AND: [{ clientId: null }, { therapistId: user.id }] },
      ],
    };
  }

  if (isClinicOwner(user) || isSecretary(user)) {
    return {
      OR: [
        { client: clientWhere },
        { AND: [{ clientId: null }, { organizationId: user.organizationId }] },
      ],
    };
  }

  if (isClinicTherapist(user)) {
    return {
      OR: [
        { client: clientWhere },
        { AND: [{ clientId: null }, { therapistId: user.id }] },
      ],
    };
  }

  return {
    OR: [
      { client: clientWhere },
      { AND: [{ clientId: null }, { therapistId: user.id }] },
    ],
  };
}

/**
 * מחזיר select-mask שבטוח למזכירה — כולל רק שדות אדמיניסטרטיביים על Client.
 * Allow-list (לא deny-list) — כל שדה חדש שייווסף לסכמה לא ייחשף אוטומטית
 * למזכירה. זה ה-source of truth של "מה מזכירה רואה על מטופל".
 *
 * שימוש:
 *   const select = isSecretary(user)
 *     ? getClientSafeSelectForSecretary()
 *     : undefined;
 *   const clients = await prisma.client.findMany({ where, select });
 *
 * שדות קליניים שאינם מופיעים (ולכן חסומים):
 *   notes, intakeNotes, initialDiagnosis, medicalHistory,
 *   therapeuticApproaches, approachNotes, culturalContext,
 *   comprehensiveAnalysis, comprehensiveAnalysisAt.
 */
export function getClientSafeSelectForSecretary() {
  return {
    id: true,
    name: true,
    firstName: true,
    lastName: true,
    phone: true,
    email: true,
    address: true,
    birthDate: true,
    status: true,
    isQuickClient: true,
    defaultSessionPrice: true,
    creditBalance: true,
    therapistId: true,
    organizationId: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}

/**
 * מחזיר select-mask שבטוח למזכירה — כולל רק שדות אדמיניסטרטיביים על
 * TherapySession. מחריג את `notes` (סיכום חופשי של המטפל — תוכן קליני)
 * ואת `topic` (נושא הפגישה — תוכן קליני). יחסים קליניים כמו `sessionNote`,
 * `sessionAnalysis`, `recordings` אינם נטענים דרך ה-select הזה בכלל —
 * יש להשתמש ב-getSessionIncludeForRole עבור include role-aware.
 */
export function getSessionSafeSelectForSecretary() {
  return {
    id: true,
    startTime: true,
    endTime: true,
    status: true,
    type: true,
    price: true,
    location: true,
    isRecurring: true,
    skipSummary: true,
    cancellationReason: true,
    cancellationRequestedAt: true,
    cancelledAt: true,
    cancelledBy: true,
    googleEventId: true,
    clientId: true,
    therapistId: true,
    organizationId: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}

/**
 * Prisma include helper ל-TherapySession שמכבד חסימות מזכירה.
 * למזכירה: טוען את המטופל עם safe select בלבד, ללא sessionNote/sessionAnalysis/recordings.
 * למטפל/בעלים: טוען את כל התכנים הקליניים.
 *
 * שימוש:
 *   const include = getSessionIncludeForRole(user);
 *   const sessions = await prisma.therapySession.findMany({ where, include });
 */
export function getSessionIncludeForRole(
  user: ScopeUser
): Prisma.TherapySessionInclude {
  if (isSecretary(user)) {
    return {
      client: { select: getClientSafeSelectForSecretary() },
    };
  }
  return {
    client: true,
    sessionNote: true,
    sessionAnalysis: true,
    recordings: {
      include: {
        transcription: {
          include: { analysis: true },
        },
      },
    },
  };
}

/**
 * Prisma include helper ל-Payment שמכבד חסימות מזכירה.
 * למזכירה: client ו-session נטענים עם safe selects (ללא שדות קליניים).
 * למטפל/בעלים: טוען את כל הרלציות המלאות.
 */
export function getPaymentIncludeForRole(
  user: ScopeUser
): Prisma.PaymentInclude {
  if (isSecretary(user)) {
    return {
      client: { select: getClientSafeSelectForSecretary() },
      session: { select: getSessionSafeSelectForSecretary() },
    };
  }
  return { client: true, session: true };
}

/**
 * בודק אם המשתמש הוא מזכירה שגישתה למודל קליני חסומה. route-agnostic —
 * לא זורק, לא מחזיר Response. ה-caller אחראי להחזיר 403/NextResponse.
 *
 * @example
 *   if (isSecretaryClinicalDenied(user, "SessionNote")) {
 *     return forbidden("מזכירה לא מורשית לצפות בסיכומי פגישה");
 *   }
 */
export function isSecretaryClinicalDenied(
  user: ScopeUser,
  modelName: ClinicalModel
): boolean {
  return isSecretary(user) && !canSecretaryAccessModel(user, modelName);
}

// ============================================================================
// DB-aware entry points — עוטפים את ה-pure helpers עם prisma fetch
// ============================================================================

/**
 * שולף את User מה-DB ומחזיר ScopeUser. החלטה לקיחה: מה-DB בלבד, אין caching
 * ברמת ה-helper (ה-caller יכול להחזיק cache משלו אם רוצה).
 *
 * @throws אם המשתמש לא נמצא או חסום (isBlocked=true) — חסימת isBlocked מתבצעת
 *         במידלוור גם כן, אבל שכבת הגנה כפולה כאן מקטינה סיכון לדליפה.
 */
export async function loadScopeUser(userId: string): Promise<ScopeUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isBlocked: true,
      organizationId: true,
      clinicRole: true,
      secretaryPermissions: true,
    },
  });

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  if (user.isBlocked) {
    throw new Error(`User is blocked: ${userId}`);
  }

  return {
    id: user.id,
    role: user.role,
    organizationId: user.organizationId,
    clinicRole: user.clinicRole,
    secretaryPermissions: (user.secretaryPermissions as SecretaryPermissions) ?? null,
  };
}

/**
 * Convenience wrapper: טוען את ה-user ובונה את ה-where ל-clients.
 * שימוש ב-Server Components / API routes ללא מטמון משלו.
 */
export async function getVisibleClientWhere(userId: string): Promise<Prisma.ClientWhereInput> {
  const user = await loadScopeUser(userId);
  return buildClientWhere(user);
}

/**
 * Convenience wrapper לפגישות.
 */
export async function getVisibleSessionWhere(userId: string): Promise<Prisma.TherapySessionWhereInput> {
  const user = await loadScopeUser(userId);
  return buildSessionWhere(user);
}
