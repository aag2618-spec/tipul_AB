import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET — רשימת קליניקות. תומך בחיפוש לפי שם/בעלים, סינון לפי תוכנית/סטטוס מנוי.
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || undefined;
    const status = searchParams.get("status") || undefined;
    const planId = searchParams.get("planId") || undefined;
    const limit = Math.min(Number(searchParams.get("limit") || "200"), 500);

    const where: Prisma.OrganizationWhereInput = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { businessName: { contains: q, mode: "insensitive" } },
        { businessIdNumber: { contains: q } },
        { owner: { email: { contains: q, mode: "insensitive" } } },
        { owner: { name: { contains: q, mode: "insensitive" } } },
      ];
    }
    if (status) {
      where.subscriptionStatus = status as Prisma.OrganizationWhereInput["subscriptionStatus"];
    }
    if (planId) where.pricingPlanId = planId;

    const orgs = await prisma.organization.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        pricingPlan: { select: { id: true, name: true, internalCode: true } },
        customContract: {
          select: { id: true, endDate: true, monthlyEquivPriceIls: true, autoRenew: true },
        },
        _count: { select: { members: true, clients: true, therapySessions: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
    });

    return NextResponse.json(JSON.parse(JSON.stringify(orgs)));
  } catch (error) {
    logger.error("[admin/clinics] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת רשימת הקליניקות" },
      { status: 500 }
    );
  }
}

// POST — יצירת קליניקה חדשה. משייך את הבעלים אוטומטית ומקצה clinicRole=OWNER.
// אם ה-owner היה USER רגיל — מעלה אותו ל-role=CLINIC_OWNER (שומר ADMIN/MANAGER).
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const body = await request.json();
    const {
      name,
      ownerUserId,
      pricingPlanId,
      ownerIsTherapist,
      businessIdNumber,
      businessName,
      businessAddress,
      businessPhone,
      logoUrl,
      aiTier,
      subscriptionStatus,
    } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ message: "נדרש שם קליניקה" }, { status: 400 });
    }
    if (!ownerUserId) {
      return NextResponse.json({ message: "נדרש לבחור בעל/ת קליניקה" }, { status: 400 });
    }
    if (!pricingPlanId) {
      return NextResponse.json({ message: "נדרש לבחור תוכנית תמחור" }, { status: 400 });
    }

    const plan = await prisma.clinicPricingPlan.findUnique({ where: { id: pricingPlanId } });
    if (!plan) {
      return NextResponse.json({ message: "תוכנית התמחור לא נמצאה" }, { status: 400 });
    }
    if (!plan.isActive) {
      return NextResponse.json(
        { message: "תוכנית התמחור לא פעילה — בחר/י תוכנית פעילה" },
        { status: 400 }
      );
    }

    const owner = await prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true, isBlocked: true, organizationId: true, role: true, name: true, email: true },
    });
    if (!owner) {
      return NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 400 });
    }
    if (owner.isBlocked) {
      return NextResponse.json(
        { message: "המשתמש חסום ולא ניתן להציבו כבעל קליניקה" },
        { status: 400 }
      );
    }
    if (owner.organizationId) {
      return NextResponse.json(
        { message: "המשתמש כבר משויך לקליניקה אחרת — נתק קודם את השיוך" },
        { status: 400 }
      );
    }

    const existingOrg = await prisma.organization.findUnique({ where: { ownerUserId } });
    if (existingOrg) {
      return NextResponse.json(
        { message: "המשתמש כבר בעלים של קליניקה אחרת" },
        { status: 400 }
      );
    }

    const org = await withAudit(
      { kind: "user", session },
      {
        action: "create_organization",
        targetType: "Organization",
        details: {
          name: String(name).trim(),
          ownerUserId,
          ownerEmail: owner.email,
          pricingPlanId,
          planCode: plan.internalCode,
        },
      },
      async (tx) => {
        const newOrg = await tx.organization.create({
          data: {
            name: String(name).trim(),
            ownerUserId,
            ownerIsTherapist: Boolean(ownerIsTherapist),
            pricingPlanId,
            businessIdNumber: businessIdNumber?.trim() || null,
            businessName: businessName?.trim() || null,
            businessAddress: businessAddress?.trim() || null,
            businessPhone: businessPhone?.trim() || null,
            logoUrl: logoUrl?.trim() || null,
            aiTier: aiTier ?? "ESSENTIAL",
            subscriptionStatus: subscriptionStatus ?? "TRIALING",
          },
        });

        await tx.user.update({
          where: { id: ownerUserId },
          data: {
            organizationId: newOrg.id,
            clinicRole: "OWNER",
            // שומר ADMIN/MANAGER. רק USER הופך ל-CLINIC_OWNER.
            ...(owner.role === "USER" && { role: "CLINIC_OWNER" }),
          },
        });

        return newOrg;
      }
    );

    return NextResponse.json(JSON.parse(JSON.stringify(org)));
  } catch (error) {
    logger.error("[admin/clinics] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הקליניקה" },
      { status: 500 }
    );
  }
}
