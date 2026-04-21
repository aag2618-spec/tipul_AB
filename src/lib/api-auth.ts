import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import {
  hasPermission,
  highestPermission,
  type Permission,
} from "@/lib/permissions";

/**
 * User must be signed in. Returns userId + session, or an error response.
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ message: "אין הרשאה" }, { status: 401 }) };
  }
  return { userId: session.user.id, session };
}

/**
 * User must be ADMIN. Kept for backwards compatibility with 30+ existing routes.
 * New code should prefer `requirePermission(key)`.
 */
export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ message: "אין הרשאה" }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN") {
    return { error: NextResponse.json({ message: "אין הרשאת מנהל" }, { status: 403 }) };
  }
  return { userId: session.user.id, session };
}

/**
 * User must be ADMIN or MANAGER.
 * Use when the endpoint is OK for both roles with no further granularity.
 */
export async function requireAdminOrManager() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ message: "אין הרשאה" }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return {
      error: NextResponse.json({ message: "אין הרשאת מנהל" }, { status: 403 }),
    };
  }
  return { userId: session.user.id, session };
}

/**
 * User must hold the given permission.
 * Preferred gate for most admin routes — replaces `requireAdmin` when the
 * action is MANAGER-allowed.
 */
export async function requirePermission(perm: Permission) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ message: "אין הרשאה" }, { status: 401 }) };
  }
  if (!hasPermission(session.user.role, perm)) {
    return {
      error: NextResponse.json(
        { message: "אין הרשאה לפעולה זו" },
        { status: 403 }
      ),
    };
  }
  return { userId: session.user.id, session };
}

/**
 * Picks the highest-ranked permission from `keys` and enforces it.
 * Used for PATCH/PUT where the body may trigger multiple permission checks —
 * e.g. {role, grantFree, extendDays} in a single request. The highest-ranked
 * permission wins; if MANAGER has all of them, OK; if one requires ADMIN, 403.
 */
export async function requireHighestPermission(
  keys: Permission[]
): Promise<
  | { error: NextResponse }
  | { userId: string; session: Session }
> {
  if (keys.length === 0) {
    return {
      error: NextResponse.json(
        { message: "שגיאה פנימית — רשימת הרשאות ריקה" },
        { status: 500 }
      ),
    };
  }
  return requirePermission(highestPermission(keys));
}
