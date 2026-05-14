import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { parseBody } from "@/lib/validations/helpers";
import { checkLimitInTx, ClinicLimitExceededError } from "@/lib/clinic/limits";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";

export const dynamic = "force-dynamic";

// secretaryPermissions — schema זהה ל-clinic-invitations/route.ts (לא משתפים
// type כי הוא מוגדר באותו קובץ).
const secretaryPermissionsSchema = z
  .object({
    canViewPayments: z.boolean().optional(),
    canIssueReceipts: z.boolean().optional(),
    canSendReminders: z.boolean().optional(),
    canCreateClient: z.boolean().optional(),
    canViewDebts: z.boolean().optional(),
    canViewStats: z.boolean().optional(),
    canViewConsentForms: z.boolean().optional(),
  })
  .strict()
  .partial();

const addMemberSchema = z.object({
  userId: z.string().min(1, "נדרש בחירת משתמש"),
  clinicRole: z.enum(["THERAPIST", "SECRETARY"]),
  secretaryPermissions: secretaryPermissionsSchema.optional(),
});

// GET — רשימת חברי הקליניקה של המשתמש המחובר.
export async function GET() {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    const members = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        clinicRole: true,
        secretaryPermissions: true,
        isBlocked: true,
        createdAt: true,
        // MyTipul-B: מציג ב-UI אם הקליניקה משלמת.
        billingPaidByClinic: true,
        subscriptionPausedReason: true,
        _count: {
          select: {
            clients: true,
          },
        },
      },
      orderBy: [{ clinicRole: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(JSON.parse(JSON.stringify(members)));
  } catch (error) {
    logger.error("[clinic-admin/members] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת חברי הקליניקה" },
      { status: 500 }
    );
  }
}

// POST — הוספת חבר חדש לקליניקה (מקשר משתמש קיים שלא משויך לארגון).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId, session } = auth;

    const parsed = await parseBody(request, addMemberSchema);
    if ("error" in parsed) return parsed.error;
    const { userId: newMemberId, clinicRole, secretaryPermissions } = parsed.data;

    const candidate = await prisma.user.findUnique({
      where: { id: newMemberId },
      select: { id: true, isBlocked: true, organizationId: true, role: true, name: true, email: true },
    });
    if (!candidate) {
      return NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 400 });
    }
    if (candidate.isBlocked) {
      return NextResponse.json(
        { message: "המשתמש חסום — לא ניתן להוסיף לקליניקה" },
        { status: 400 }
      );
    }
    if (candidate.organizationId) {
      return NextResponse.json(
        { message: "המשתמש כבר משויך לקליניקה" },
        { status: 400 }
      );
    }
    // לא יכול להוסיף ADMIN/MANAGER גלובליים כחבר קליניקה — הם פועלים ברמת המערכת
    if (candidate.role === "ADMIN" || candidate.role === "MANAGER") {
      return NextResponse.json(
        { message: "לא ניתן לשייך משתמשי מערכת (ADMIN/MANAGER) לקליניקה" },
        { status: 400 }
      );
    }

    // race-safe: limit check + update בתוך אותו Serializable tx —
    // מונע TOCTOU כששני OWNERs מוסיפים חברים במקביל.
    let updated;
    try {
      updated = await withAudit(
        { kind: "user", session },
        {
          action: "add_clinic_member",
          targetType: "User",
          targetId: newMemberId,
          details: {
            organizationId,
            clinicRole,
            memberEmail: candidate.email,
          },
        },
        async (tx) => {
          const limit = await checkLimitInTx({
            tx,
            organizationId,
            clinicRole,
            excludeInvitationId: "",
          });
          if (!limit.allowed) {
            throw new ClinicLimitExceededError(
              limit.message ?? "הגעת לתקרת המקומות בתוכנית",
              limit.current,
              limit.max
            );
          }

          return tx.user.update({
            where: { id: newMemberId },
            data: {
              organizationId,
              clinicRole,
              // role ב-User רמה גלובלית — מעדכנים רק ל-SECRETARY (THERAPIST נשאר USER)
              ...(clinicRole === "SECRETARY" && { role: "CLINIC_SECRETARY" }),
              secretaryPermissions:
                clinicRole === "SECRETARY"
                  ? secretaryPermissions ?? {
                      canViewPayments: false,
                      canIssueReceipts: false,
                      canSendReminders: true,
                      canCreateClient: true,
                      canViewDebts: false,
                      canViewStats: false,
                    }
                  : Prisma.DbNull, // Prisma.DbNull על Json? — null פשוט לא מנקה.
            },
          });
        }
      );
    } catch (err) {
      if (err instanceof ClinicLimitExceededError) {
        return NextResponse.json(
          { message: err.message, limit: { current: err.current, max: err.max } },
          { status: 403 }
        );
      }
      throw err;
    }

    return NextResponse.json(JSON.parse(JSON.stringify(updated)));
  } catch (error) {
    logger.error("[clinic-admin/members] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בהוספת חבר" },
      { status: 500 }
    );
  }
}

