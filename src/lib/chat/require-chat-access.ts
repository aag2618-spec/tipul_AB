// ============================================================================
// requireChatAccess — שער auth ל-routes של צ׳אט הצוות
// ============================================================================
// צ׳אט הצוות פתוח אך ורק לחברי ארגון בתפקיד OWNER או SECRETARY (החלטת מוצר:
// מנהלת + מזכירות בלבד; מטפלים לא בשלב זה). מטפל עצמאי (organizationId=null)
// ומטפל בקליניקה (THERAPIST) נחסמים.
//
// כל בידוד הצ׳אט מתבסס על organizationId — אסור אף פעם לאפשר גישה חוצת-ארגון.
//
// מחזיר { userId, session, organizationId, name, isOwner, isSecretary, scopeUser }
// או { error } עם NextResponse (401/403/400/404 לפי המקרה).
// ============================================================================

import "server-only";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import type { ScopeUser, SecretaryPermissions } from "@/lib/scope";
import { isClinicOwner, isSecretary } from "@/lib/scope";

export interface ChatAccessAuth {
  userId: string;
  session: Session;
  organizationId: string;
  name: string | null;
  isOwner: boolean;
  isSecretary: boolean;
  /** ScopeUser מלא — לשימוש ב-buildClientWhere בעת קישור מטופל. */
  scopeUser: ScopeUser;
}

export type ChatAccessAuthResult =
  | ChatAccessAuth
  | { error: NextResponse<{ message: string }> };

export async function requireChatAccess(): Promise<ChatAccessAuthResult> {
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
        { message: "צ׳אט הצוות זמין רק לחברי קליניקה" },
        { status: 403 }
      ),
    };
  }

  const scopeUser: ScopeUser = {
    id: user.id,
    role: user.role,
    organizationId: user.organizationId,
    clinicRole: user.clinicRole,
    secretaryPermissions:
      (user.secretaryPermissions as SecretaryPermissions | null) ?? null,
  };

  const owner = isClinicOwner(scopeUser);
  const secretary = isSecretary(scopeUser);

  // רק בעלת קליניקה או מזכירה — מטפל בקליניקה (THERAPIST) חסום בשלב זה.
  if (!owner && !secretary) {
    return {
      error: NextResponse.json(
        { message: "אין לך גישה לצ׳אט הצוות" },
        { status: 403 }
      ),
    };
  }

  return {
    userId,
    session,
    organizationId: user.organizationId,
    name: user.name,
    isOwner: owner,
    isSecretary: secretary,
    scopeUser,
  };
}
