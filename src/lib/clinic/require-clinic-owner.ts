// ============================================================================
// requireClinicOwner — auth gate משותף ל-routes של clinic-admin
// ============================================================================
// מחליף את הכפילות בין 5+ routes (invitations, members, members/[id],
// invitations/[id], limits, etc). שינוי שדה auth (כמו isBlocked) מתבצע
// פעם אחת ולא 5 פעמים.
//
// מחזיר { userId, session, organizationId, name } או { error } עם NextResponse
// (status נכון: 401/403/404/400 לפי המקרה).
// ============================================================================

import "server-only";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import type { SecretaryPermissions } from "@/lib/scope";

export interface ClinicOwnerAuth {
  userId: string;
  session: Session;
  organizationId: string;
  name: string | null;
}

export type ClinicOwnerAuthResult =
  | ClinicOwnerAuth
  | { error: NextResponse<{ message: string }> };

// Phase 4 follow-up: גרסה גמישה יותר ש-allow-list ספציפי של הרשאות מזכירה
// יכול לפתוח גישה. מחזיר את אותו shape כמו requireClinicOwner + סימון
// אם המשתמש הוא בעלים אמיתי (`isOwner: true`) או מזכירה עם הרשאה (`isOwner: false`).
// השאר זהה לחלוטין: organizationId, isBlocked check, ADMIN no-bypass.
export interface ClinicAdminAuth extends ClinicOwnerAuth {
  isOwner: boolean;
  isSecretary: boolean;
}

export type ClinicAdminAuthResult =
  | ClinicAdminAuth
  | { error: NextResponse<{ message: string }> };

export async function requireClinicAdminAccess(options: {
  allowSecretaryWith?: keyof SecretaryPermissions;
}): Promise<ClinicAdminAuthResult> {
  const auth = await requireAuth();
  if ("error" in auth && auth.error) return { error: auth.error };
  if (!("userId" in auth) || !auth.userId || !auth.session) {
    return {
      error: NextResponse.json({ message: "אין הרשאה" }, { status: 401 }),
    };
  }
  const { userId, session } = auth;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      clinicRole: true,
      organizationId: true,
      name: true,
      isBlocked: true,
      secretaryPermissions: true,
    },
  });
  if (!user) {
    return {
      error: NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 }),
    };
  }
  if (user.isBlocked) {
    return {
      error: NextResponse.json({ message: "המשתמש חסום" }, { status: 403 }),
    };
  }
  if (!user.organizationId) {
    return {
      error: NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 400 }
      ),
    };
  }

  const isOwner = user.role === "CLINIC_OWNER" || user.clinicRole === "OWNER";
  const isSecretary =
    user.clinicRole === "SECRETARY" || user.role === "CLINIC_SECRETARY";

  // מזכירה עם ההרשאה המבוקשת — מאושרת. בעלים — תמיד מאושר.
  if (!isOwner) {
    const perm = options.allowSecretaryWith;
    const perms = (user.secretaryPermissions as SecretaryPermissions | null) ?? null;
    const hasPermission = isSecretary && perm && Boolean(perms?.[perm]);
    if (!hasPermission) {
      return {
        error: NextResponse.json(
          { message: "אין הרשאה לפעולה זו" },
          { status: 403 }
        ),
      };
    }
  }

  return {
    userId,
    session,
    organizationId: user.organizationId,
    name: user.name,
    isOwner,
    isSecretary,
  };
}

export async function requireClinicOwner(): Promise<ClinicOwnerAuthResult> {
  const auth = await requireAuth();
  if ("error" in auth && auth.error) return { error: auth.error };
  if (!("userId" in auth) || !auth.userId || !auth.session) {
    // לא אמור לקרות (requireAuth מחזיר או error או userId+session), אבל
    // ל-narrowing של TS.
    return {
      error: NextResponse.json({ message: "אין הרשאה" }, { status: 401 }),
    };
  }
  const { userId, session } = auth;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      clinicRole: true,
      organizationId: true,
      name: true,
      isBlocked: true,
    },
  });
  if (!user) {
    return {
      error: NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 }),
    };
  }
  if (user.isBlocked) {
    return {
      error: NextResponse.json({ message: "המשתמש חסום" }, { status: 403 }),
    };
  }
  // M10.5: ADMIN גלובלי משתמש ב-/api/admin/* בלבד. אסור bypass כאן —
  // /api/clinic-admin/* הוא endpoint per-tenant, ה-organizationId שלו מגיע
  // מטבלת ה-User של ה-OWNER. ADMIN שאינו בעל קליניקה בארגון מסוים אינו
  // אמור לבצע פעולות per-tenant דרך הצינור הזה.
  const isOwner = user.role === "CLINIC_OWNER" || user.clinicRole === "OWNER";
  if (!isOwner) {
    return {
      error: NextResponse.json(
        { message: "הפעולה זמינה לבעלי קליניקה בלבד" },
        { status: 403 }
      ),
    };
  }
  if (!user.organizationId) {
    return {
      error: NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 400 }
      ),
    };
  }
  return {
    userId,
    session,
    organizationId: user.organizationId,
    name: user.name,
  };
}
