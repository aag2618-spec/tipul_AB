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
 *
 * 2FA gate: אם המשתמש בעיצומו של אימות 2FA (requires2FA=true), חוסמים גישה
 * לכל API routes המוגנים ע"י requireAuth. זה defense-in-depth מעבר למידלוור,
 * ומבטיח שגם API routes שלא בmatcher של middleware (clients/sessions/billing)
 * לא ייגשו על ידי טוקן חצי-מאומת.
 *
 * isBlocked: לא נבדק כאן (במכוון). חסימת isBlocked ל-API נאכפת ב-middleware
 * עם allowlist מינימלי (/api/payments, /api/integrations/billing,
 * /api/subscription/status|create, GET-only של /api/user/*) — מאפשר תשלום
 * חוב ויציאה מחסימה. שאר ה-routes שמשתמשים ב-requireAuth ייחסמו
 * ב-middleware לפני שהroute רץ, אז אין צורך בbדיקה כפולה כאן.
 *
 * Impersonation: בעת ש-OWNER מתחזה ל-target, ה-userId המוחזר הוא של ה-target
 * — כך שכל data scope, queries, ו-permissions זורמים לחוויית ה-target.
 * ה-OWNER האמיתי זמין ב-originalUserId. isImpersonating + actingAs מאפשרים
 * ל-routes שמכירים ב-impersonation (audit, banner, stop) לטפל אחרת.
 *
 * `disallowImpersonation: true` — חוסם בכוח את ה-route בעת impersonation.
 * נדרש ל-routes רגישים שאסור ל-OWNER להפעיל בשם target: חיבור Cardcom אישי,
 * שינוי סיסמה, הפעלת/ביטול 2FA, ביטול מנוי, עריכת פרופיל.
 */
export async function requireAuth(opts?: { disallowImpersonation?: boolean }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ message: "אין הרשאה" }, { status: 401 }) };
  }
  // C7: defense-in-depth מעבר ל-middleware. routes שלא נכנסים ב-matcher
  // (api/auth/*) יעברו כאן אם בכלל יקראו ל-requireAuth, ולא ישתמשו ב-token
  // שהונפק לפני שינוי סיסמה.
  if (session.user.passwordStale) {
    return {
      error: NextResponse.json(
        { message: "הסיסמה שונתה. נא להתחבר מחדש." },
        { status: 401 }
      ),
    };
  }
  // H6 (סבב אבטחה 14): sessionVersion bump (2FA enable/disable, admin block) →
  // jwt callback סימן sessionStale. defense-in-depth כמו passwordStale.
  if (session.user.sessionStale) {
    return {
      error: NextResponse.json(
        { message: "ההגדרות שלך שונו. נא להתחבר מחדש." },
        { status: 401 }
      ),
    };
  }
  // C9: defense-in-depth — סשן חצה max-lifetime.
  if (session.user.sessionExpired) {
    return {
      error: NextResponse.json(
        { message: "הסשן פג. נא להתחבר מחדש." },
        { status: 401 }
      ),
    };
  }
  if (session.user.requires2FA) {
    return {
      error: NextResponse.json(
        { message: "נדרש אימות דו-שלבי. נא לחזור לדף האימות." },
        { status: 403 }
      ),
    };
  }
  if (opts?.disallowImpersonation && session.user.actingAs) {
    return {
      error: NextResponse.json(
        {
          message:
            "פעולה זו אינה זמינה במצב התחזות. צא/י ממצב ההתחזות תחילה ונסה/י שוב.",
        },
        { status: 403 }
      ),
    };
  }
  return {
    userId: session.user.id,
    originalUserId: session.user.originalUserId ?? session.user.id,
    isImpersonating: !!session.user.actingAs,
    actingAs: session.user.actingAs,
    session,
  };
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
  if (session.user.requires2FA) {
    return {
      error: NextResponse.json(
        { message: "נדרש אימות דו-שלבי" },
        { status: 403 }
      ),
    };
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
  if (session.user.requires2FA) {
    return {
      error: NextResponse.json(
        { message: "נדרש אימות דו-שלבי" },
        { status: 403 }
      ),
    };
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
  if (session.user.requires2FA) {
    return {
      error: NextResponse.json(
        { message: "נדרש אימות דו-שלבי" },
        { status: 403 }
      ),
    };
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
