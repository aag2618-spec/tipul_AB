// H18 follow-up: Admin endpoint לכיבוי 2FA למשתמש שאיבד גישה
// (איבד טלפון + איבד קודי שחזור = נעול לחלוטין).
//
// אבטחה:
//   • requirePermission("users.disable_2fa") — ADMIN בלבד (rank 10)
//   • דורש justification (סיבה כתובה) — נשמרת ב-AdminAuditLog
//   • withAudit — רישום ב-DB עם undoable=true (אדמין יכול לבטל תוך 10 שניות)
//   • invalidateJwtCache — סוגר חלון הזדמנות של 30s
//
// הפעולה:
//   • twoFactorEnabled → false
//   • twoFactorMethod → null
//   • twoFactorSecret → null (גם המוצפן נמחק — אסור להשאיר orphan secret)
//   • twoFactorRecoveryCodes → null
//   • המשתמש יוכל להיכנס בלי 2FA ולהגדיר מחדש מהtab Security ב-Settings.
//
// **חשוב**: הפעולה הזו חוטטת בחלון הזדמנות לתוקף שגנב את הסיסמה. השימוש בה
// צריך להיות מינימלי, אחרי וידוא זהות מחוץ למערכת (טלפון/מייל מאומת).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { invalidateJwtCache } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("users.disable_2fa");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;

    let body: { justification?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
    }

    const justification =
      typeof body.justification === "string" ? body.justification.trim() : "";

    // ההצדקה חובה — לא לאפשר לאדמין להפעיל בלי לתעד למה.
    // מינימום 10 תווים: דורש משפט הסבר (לא רק "test" או "ok").
    if (justification.length < 10) {
      return NextResponse.json(
        { message: "נדרשת הצדקה כתובה של לפחות 10 תווים (הסבר מדוע כובה 2FA)" },
        { status: 400 }
      );
    }
    if (justification.length > 500) {
      return NextResponse.json(
        { message: "הצדקה ארוכה מדי (מקסימום 500 תווים)" },
        { status: 400 }
      );
    }

    // לא לאפשר disable-2FA על האדמין עצמו דרך ה-endpoint הזה — סיכון נעילה עצמית
    // וגם self-bypass של דרישת 2FA. אדמין שצריך לאפס לעצמו ייאלץ דרך DB ישירות
    // (עם 2-eyes/oversight) או דרך admin אחר.
    if (id === session.user.id) {
      return NextResponse.json(
        { message: "לא ניתן לכבות 2FA לחשבון שלך דרך endpoint זה. השתמש/י בtab Security ב-Settings." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        twoFactorEnabled: true,
        twoFactorMethod: true,
        twoFactorSecret: true,
        twoFactorRecoveryCodes: true,
      },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    if (!user.twoFactorEnabled && !user.twoFactorMethod && !user.twoFactorSecret) {
      return NextResponse.json(
        { message: "2FA כבר כבוי למשתמש זה" },
        { status: 400 }
      );
    }

    const previousState = {
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorMethod: user.twoFactorMethod,
      hadSecret: Boolean(user.twoFactorSecret),
      hadRecoveryCodes: Boolean(user.twoFactorRecoveryCodes),
    };

    await withAudit(
      { kind: "user", session },
      {
        action: "disable_2fa",
        targetType: "user",
        targetId: id,
        details: {
          justification,
          previousState,
          targetUserEmail: user.email,
        },
      },
      async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            twoFactorEnabled: false,
            twoFactorMethod: null,
            twoFactorSecret: null,
            twoFactorRecoveryCodes: null,
          },
        });
      }
    );

    // סוגרים את ה-JWT cache: אם המשתמש הקצה היה באמצע סשן עם requires2FA=true,
    // הסשן הבא יראה enabled=false (ברירת מחדל DB שונתה).
    invalidateJwtCache(id);

    logger.info("[admin/disable-2fa] 2FA disabled by admin", {
      adminId: session.user.id,
      targetUserId: id,
      justificationLength: justification.length,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[admin/disable-2fa] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בכיבוי 2FA" },
      { status: 500 }
    );
  }
}
