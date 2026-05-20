import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validations/helpers";
import { impersonateStartSchema } from "@/lib/validations/clinic-admin";
import { getClientIp } from "@/lib/get-client-ip";

export const dynamic = "force-dynamic";

// Rate limit: 10 ניסיונות התחלת impersonation בדקה לכל OWNER.
// אכיפה של DoS על ה-DB אם credential של OWNER נגנב או שיש באג ב-UI.
const IMPERSONATE_START_RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };

// POST — מתחיל impersonation: OWNER נכנס "כעין" THERAPIST/SECRETARY של הקליניקה.
// body: { targetUserId: string, reason: string (5-500 תווים) }
//
// הולידציה כאן היא הגנת השרת — לא להישען על UI.
// ראה ImpersonationSession בסכימה לתיעוד מלא של המגבלות.
export async function POST(request: NextRequest) {
  try {
    // Kill-switch: ENV `IMPERSONATION_DISABLED=true` משבית את כל ה-feature
    // ב-flip של variable (ללא deploy חדש). להפעלה מהירה אם מתגלה bug
    // אבטחה ב-production.
    if (process.env.IMPERSONATION_DISABLED === "true") {
      return NextResponse.json(
        { message: "מצב התחזות מושבת זמנית. נסה/י שוב מאוחר יותר." },
        { status: 503 }
      );
    }

    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, isImpersonating, session } = auth;

    // Rate limit לפי OWNER — 10/דקה. בקשות נוספות נחסמות עם 429.
    const rateCheck = checkRateLimit(
      `impersonate_start:${userId}`,
      IMPERSONATE_START_RATE_LIMIT
    );
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { message: "יותר מדי ניסיונות. נסה/י שוב בעוד דקה." },
        { status: 429 }
      );
    }

    // בעת impersonation פעיל, אסור להתחיל סשן חדש לפני stop של הקיים
    if (isImpersonating) {
      return NextResponse.json(
        { message: "כבר במצב התחזות. עצרי/סיימי את ההתחזות הנוכחית קודם." },
        { status: 400 }
      );
    }

    const parsed = await parseBody(request, impersonateStartSchema);
    if ("error" in parsed) return parsed.error;
    const { targetUserId, reason } = parsed.data;

    if (targetUserId === userId) {
      return NextResponse.json(
        { message: "לא ניתן להתחזות לעצמך" },
        { status: 400 }
      );
    }

    // ולידציה: האם אני OWNER של ארגון פעיל?
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        clinicRole: true,
        organizationId: true,
        isBlocked: true,
      },
    });
    if (!me) {
      return NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 });
    }
    if (me.isBlocked) {
      return NextResponse.json({ message: "החשבון מושבת" }, { status: 403 });
    }

    const isOwner = me.role === "CLINIC_OWNER" || me.clinicRole === "OWNER";
    if (!isOwner) {
      return NextResponse.json(
        { message: "רק בעל/ת קליניקה יכול/ה להתחזות" },
        { status: 403 }
      );
    }
    if (!me.organizationId) {
      return NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 400 }
      );
    }

    // ולידציה: האם ה-target חוקי?
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        role: true,
        clinicRole: true,
        organizationId: true,
        isBlocked: true,
      },
    });
    if (!target) {
      return NextResponse.json(
        { message: "המשתמש היעד לא נמצא" },
        { status: 404 }
      );
    }
    if (target.organizationId !== me.organizationId) {
      return NextResponse.json(
        { message: "אסור להתחזות למשתמש מארגון אחר" },
        { status: 403 }
      );
    }
    if (target.isBlocked) {
      return NextResponse.json(
        { message: "אסור להתחזות למשתמש חסום" },
        { status: 400 }
      );
    }
    // הגנה: אסור להתחזות ל-ADMIN/MANAGER (אדמינים אינם חברי קליניקה רגילים)
    if (target.role === "ADMIN" || target.role === "MANAGER") {
      return NextResponse.json(
        { message: "אסור להתחזות לאדמין/מנהל" },
        { status: 403 }
      );
    }
    // הגנה: OWNER לא יכול להתחזות ל-OWNER אחר (privilege escalation)
    if (target.clinicRole === "OWNER" || target.role === "CLINIC_OWNER") {
      return NextResponse.json(
        { message: "אסור להתחזות לבעל/ת קליניקה" },
        { status: 403 }
      );
    }

    // IP + user-agent לאודיט (forensics).
    // round15 (1.2): שימוש ב-getClientIp (rightmost XFF) במקום leftmost —
    // leftmost ניתן לזיוף ע"י תוקף. ראה src/lib/get-client-ip.ts.
    const ip = getClientIp(request);
    const ua = request.headers.get("user-agent");

    // יצירה אטומית: ImpersonationSession + AdminAuditLog
    // בגלל partial unique index (impersonatorId WHERE endedAt IS NULL),
    // יצירת סשן שני תיכשל ב-DB עם P2002. תופסים בסט try/catch ומחזירים 409.
    let impSession;
    try {
      impSession = await withAudit(
        { kind: "user", session },
        {
          action: "impersonate_start",
          targetType: "User",
          targetId: targetUserId,
          details: {
            organizationId: me.organizationId,
            targetName: target.name,
            targetRole: target.role,
            targetClinicRole: target.clinicRole,
            reason: reason.trim(),
          },
        },
        async (tx) => {
          return tx.impersonationSession.create({
            data: {
              organizationId: me.organizationId!,
              impersonatorId: userId,
              targetUserId,
              reason: reason.trim(),
              impersonatorNameSnapshot: me.name || "—",
              targetNameSnapshot: target.name || "—",
              ipAddress: ip,
              userAgent: ua,
            },
          });
        }
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2002") {
        return NextResponse.json(
          {
            message:
              "כבר קיים סשן התחזות פעיל. רענני את הדף ונסי שוב, או עצרי את הסשן הקיים.",
          },
          { status: 409 }
        );
      }
      throw err;
    }

    // החזרת ה-payload — ה-client מעדכן את ה-session דרך useSession().update()
    return NextResponse.json({
      success: true,
      actingAs: {
        userId: target.id,
        name: target.name || "—",
        role: target.role,
        clinicRole: target.clinicRole,
        organizationId: target.organizationId,
        sessionId: impSession.id,
        startedAt: impSession.startedAt.getTime(),
      },
    });
  } catch (error) {
    logger.error("[impersonate/start] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בהתחלת ההתחזות" },
      { status: 500 }
    );
  }
}
