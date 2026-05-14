// ============================================================================
// Clinic Limits — DB wrappers
// ============================================================================
// Pure helpers ב-limits-helpers.ts. כאן: fetch מ-Prisma + checkLimit.
//
// מקור התקרה (לפי resolveTherapistLimit/resolveSecretaryLimit):
//   1. CustomContract פעיל (startDate<=now<=endDate) — customMax*  גובר.
//   2. אחרת — ClinicPricingPlan.max*.
//   3. null = ללא הגבלה.
//
// שימוש:
//   const check = await fetchAndCheckLimit(orgId, "THERAPIST");
//   if (!check.allowed) return 403 with check.message.
//
// race-safe: ב-accept route נשתמש ב-checkLimitInTx (בתוך Serializable).
// ב-POST של invitations/members — להשתמש ב-checkLimitInTx בתוך Serializable
// transaction כדי למנוע TOCTOU.
// ============================================================================

import "server-only";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  resolveTherapistLimit,
  resolveSecretaryLimit,
  checkLimit,
  type LimitCheck,
} from "@/lib/clinic/limits-helpers";

export {
  resolveTherapistLimit,
  resolveSecretaryLimit,
  checkLimit,
  type LimitCheck,
  type ResolvablePlan,
  type ResolvableContract,
} from "@/lib/clinic/limits-helpers";

export type ClinicMemberRole = "THERAPIST" | "SECRETARY";

/**
 * נזרק בתוך withAudit כש-checkLimitInTx מחזיר !allowed.
 * ה-caller (POST routes) תופס ומחזיר 403 עם פרטי התקרה.
 */
export class ClinicLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly current: number,
    public readonly max: number | null
  ) {
    super(message);
    this.name = "ClinicLimitExceededError";
  }
}

const ORG_LIMITS_SELECT = {
  pricingPlan: { select: { maxTherapists: true, maxSecretaries: true } },
  customContract: {
    select: {
      startDate: true,
      endDate: true,
      customMaxTherapists: true,
      customMaxSecretaries: true,
    },
  },
} as const;

function notFound(): LimitCheck {
  return {
    allowed: false,
    current: 0,
    max: 0,
    remaining: 0,
    message: "הקליניקה לא נמצאה",
  };
}

function resolveMaxFor(
  role: ClinicMemberRole,
  plan: { maxTherapists: number | null; maxSecretaries: number | null },
  contract: {
    startDate: Date;
    endDate: Date;
    customMaxTherapists: number | null;
    customMaxSecretaries: number | null;
  } | null,
  now: Date
): number | null {
  return role === "THERAPIST"
    ? resolveTherapistLimit({ plan, contract, now })
    : resolveSecretaryLimit({ plan, contract, now });
}

/**
 * שולף את התוכנית והחוזה של הקליניקה + סופר חברים + invitations PENDING שלא פגו,
 * ומחזיר checkResult.
 *
 * סופרים גם PENDING — אחרת אפשר ליצור 20 invitations במקביל ולעקוף את התקרה
 * לפני שאחת מהן תתקבל.
 *
 * **הערה:** הקריאה הזו אינה race-safe מול בקשה מקבילה. עבור flow שיוצר רשומה
 * (invitation/member POST), עטוף ב-`prisma.$transaction(..., { isolationLevel:
 * "Serializable" })` והשתמש ב-`checkLimitInTx` בתוך אותה tx — אחרת שני OWNERs
 * בו-זמנית יכולים לעקוף את התקרה.
 */
export async function fetchAndCheckLimit(
  organizationId: string,
  role: ClinicMemberRole,
  options?: { now?: Date }
): Promise<LimitCheck> {
  const now = options?.now ?? new Date();

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: ORG_LIMITS_SELECT,
  });
  if (!org) return notFound();

  const max = resolveMaxFor(role, org.pricingPlan, org.customContract, now);

  // OWNER לעולם לא נספר — ה-filter clinicRole={THERAPIST|SECRETARY} מבטיח זאת.
  // אם יוסיפו clinicRole חדש בעתיד (כמו STUDENT), צריך להוסיף ידנית לרשימה.
  const [activeMembers, pendingInvites] = await Promise.all([
    prisma.user.count({ where: { organizationId, clinicRole: role } }),
    prisma.clinicInvitation.count({
      where: {
        organizationId,
        status: "PENDING",
        clinicRole: role,
        expiresAt: { gt: now },
      },
    }),
  ]);

  return checkLimit({ current: activeMembers + pendingInvites, max });
}

// ─── Backwards-compat wrappers ──
// קוד קיים שמייבא את הפונקציות הספציפיות לפי תפקיד.

export const fetchAndCheckTherapistLimit = (
  organizationId: string,
  options?: { now?: Date }
) => fetchAndCheckLimit(organizationId, "THERAPIST", options);

export const fetchAndCheckSecretaryLimit = (
  organizationId: string,
  options?: { now?: Date }
) => fetchAndCheckLimit(organizationId, "SECRETARY", options);

/**
 * race-safe re-check בתוך טרנזקציה (Serializable) — נקרא מ-accept route
 * וגם מ-POST של invitations/members כדי למנוע TOCTOU.
 *
 * חייב להיקרא מתוך tx (לא prisma הגלובלי) כדי שיהיה תחת אותו isolation.
 *
 * @param excludeInvitationId — מזהה ה-invitation הנוכחית שלא לספור (כי בדיוק
 *   עוברת ל-ACCEPTED ב-accept, או שעוד לא נוצרה ב-POST — העבר string ריק אז).
 *   ה-counts יסתכלו על כל ה-others שעדיין PENDING.
 */
export async function checkLimitInTx(params: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  clinicRole: ClinicMemberRole;
  excludeInvitationId: string;
  now?: Date;
}): Promise<LimitCheck> {
  const { tx, organizationId, clinicRole } = params;
  const now = params.now ?? new Date();

  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: ORG_LIMITS_SELECT,
  });
  if (!org) return notFound();

  const max = resolveMaxFor(clinicRole, org.pricingPlan, org.customContract, now);

  const pendingWhere: Prisma.ClinicInvitationWhereInput = {
    organizationId,
    status: "PENDING",
    clinicRole,
    expiresAt: { gt: now },
  };
  if (params.excludeInvitationId) {
    pendingWhere.id = { not: params.excludeInvitationId };
  }

  const [activeMembers, otherPending] = await Promise.all([
    tx.user.count({ where: { organizationId, clinicRole } }),
    tx.clinicInvitation.count({ where: pendingWhere }),
  ]);

  return checkLimit({ current: activeMembers + otherPending, max });
}
