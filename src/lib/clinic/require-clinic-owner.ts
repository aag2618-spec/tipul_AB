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

export interface ClinicOwnerAuth {
  userId: string;
  session: Session;
  organizationId: string;
  name: string | null;
}

export type ClinicOwnerAuthResult =
  | ClinicOwnerAuth
  | { error: NextResponse<{ message: string }> };

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
  const isOwner = user.role === "CLINIC_OWNER" || user.clinicRole === "OWNER";
  if (!isOwner && user.role !== "ADMIN") {
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
