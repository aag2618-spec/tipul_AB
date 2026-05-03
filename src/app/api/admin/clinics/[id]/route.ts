import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET — תצוגה מלאה של קליניקה: בעלים, חברים, חוזה, פרטי תוכנית, מטריקות.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true, role: true, isBlocked: true } },
        pricingPlan: true,
        customContract: {
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
          },
        },
        members: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            clinicRole: true,
            isBlocked: true,
            createdAt: true,
          },
          orderBy: [{ clinicRole: "asc" }, { name: "asc" }],
        },
        _count: {
          select: {
            members: true,
            clients: true,
            therapySessions: true,
            payments: true,
            transferLogs: true,
            departures: true,
          },
        },
      },
    });

    if (!org) {
      return NextResponse.json({ message: "הקליניקה לא נמצאה" }, { status: 404 });
    }

    return NextResponse.json(JSON.parse(JSON.stringify(org)));
  } catch (error) {
    logger.error("[admin/clinics/[id]] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הקליניקה" },
      { status: 500 }
    );
  }
}

// PATCH — עדכון פרטי קליניקה. תומך בשינויים פשוטים + שינוי תוכנית + העברת בעלות.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, ownerUserId: true, pricingPlanId: true },
    });
    if (!existing) {
      return NextResponse.json({ message: "הקליניקה לא נמצאה" }, { status: 404 });
    }

    // אימות שינוי תוכנית — חייבת להיות קיימת ופעילה
    if (body.pricingPlanId !== undefined && body.pricingPlanId !== existing.pricingPlanId) {
      const plan = await prisma.clinicPricingPlan.findUnique({
        where: { id: body.pricingPlanId },
      });
      if (!plan) {
        return NextResponse.json({ message: "תוכנית התמחור לא נמצאה" }, { status: 400 });
      }
      if (!plan.isActive) {
        return NextResponse.json(
          { message: "לא ניתן להעביר לתוכנית לא פעילה" },
          { status: 400 }
        );
      }
    }

    // אימות העברת בעלות
    let newOwnerSnapshot: { oldId: string; newId: string; oldRole: string; newRole: string } | null = null;
    if (body.ownerUserId !== undefined && body.ownerUserId !== existing.ownerUserId) {
      const newOwner = await prisma.user.findUnique({
        where: { id: body.ownerUserId },
        select: { id: true, isBlocked: true, organizationId: true, role: true, name: true },
      });
      if (!newOwner) {
        return NextResponse.json({ message: "המשתמש החדש לא נמצא" }, { status: 400 });
      }
      if (newOwner.isBlocked) {
        return NextResponse.json(
          { message: "לא ניתן להפוך משתמש חסום לבעלים" },
          { status: 400 }
        );
      }
      // Owner חדש חייב להיות חבר באותו ארגון, או לא משויך לאף ארגון
      if (newOwner.organizationId !== null && newOwner.organizationId !== id) {
        return NextResponse.json(
          { message: "המשתמש החדש משויך לקליניקה אחרת" },
          { status: 400 }
        );
      }
      // ownerUserId הוא @unique ב-Organization — אם המשתמש כבר בעלים של ארגון אחר, נכשל
      const otherOrg = await prisma.organization.findUnique({
        where: { ownerUserId: body.ownerUserId },
        select: { id: true },
      });
      if (otherOrg && otherOrg.id !== id) {
        return NextResponse.json(
          { message: "המשתמש החדש כבר בעלים של קליניקה אחרת" },
          { status: 400 }
        );
      }
      newOwnerSnapshot = {
        oldId: existing.ownerUserId,
        newId: body.ownerUserId,
        oldRole: "kept",
        newRole: newOwner.role,
      };
    }

    const updated = await withAudit(
      { kind: "user", session },
      {
        action: "update_organization",
        targetType: "Organization",
        targetId: id,
        details: {
          changes: Object.keys(body),
          ...(newOwnerSnapshot && { ownership_transfer: newOwnerSnapshot }),
        },
      },
      async (tx) => {
        const data: Prisma.OrganizationUpdateInput = {};

        if (body.name !== undefined) data.name = String(body.name).trim();
        if (body.businessIdNumber !== undefined)
          data.businessIdNumber = body.businessIdNumber?.trim() || null;
        if (body.businessName !== undefined)
          data.businessName = body.businessName?.trim() || null;
        if (body.businessAddress !== undefined)
          data.businessAddress = body.businessAddress?.trim() || null;
        if (body.businessPhone !== undefined)
          data.businessPhone = body.businessPhone?.trim() || null;
        if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl?.trim() || null;
        if (body.ownerIsTherapist !== undefined)
          data.ownerIsTherapist = Boolean(body.ownerIsTherapist);
        if (body.aiTier !== undefined) data.aiTier = body.aiTier;
        if (body.subscriptionStatus !== undefined)
          data.subscriptionStatus = body.subscriptionStatus;
        if (body.subscriptionStartedAt !== undefined)
          data.subscriptionStartedAt = body.subscriptionStartedAt
            ? new Date(body.subscriptionStartedAt)
            : null;
        if (body.subscriptionEndsAt !== undefined)
          data.subscriptionEndsAt = body.subscriptionEndsAt
            ? new Date(body.subscriptionEndsAt)
            : null;
        if (body.pricingPlanId !== undefined && body.pricingPlanId !== existing.pricingPlanId) {
          data.pricingPlan = { connect: { id: body.pricingPlanId } };
        }

        // העברת בעלות — מתבצעת בטרנזקציה עם עדכון ה-Users משני הצדדים
        if (newOwnerSnapshot) {
          // Owner הישן — מאבד clinicRole=OWNER, הופך ל-THERAPIST (נשאר חבר). role נשאר.
          await tx.user.update({
            where: { id: newOwnerSnapshot.oldId },
            data: { clinicRole: "THERAPIST" },
          });
          // Owner החדש — מצטרף לארגון אם לא היה, מקבל clinicRole=OWNER
          await tx.user.update({
            where: { id: newOwnerSnapshot.newId },
            data: {
              organizationId: id,
              clinicRole: "OWNER",
              ...(newOwnerSnapshot.newRole === "USER" && { role: "CLINIC_OWNER" }),
            },
          });
          data.owner = { connect: { id: newOwnerSnapshot.newId } };
        }

        return tx.organization.update({ where: { id }, data });
      }
    );

    return NextResponse.json(JSON.parse(JSON.stringify(updated)));
  } catch (error) {
    logger.error("[admin/clinics/[id]] PATCH error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הקליניקה" },
      { status: 500 }
    );
  }
}
