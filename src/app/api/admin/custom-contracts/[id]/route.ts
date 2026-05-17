import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { parseBody } from "@/lib/validations/helpers";
import { updateCustomContractSchema } from "@/lib/validations/billing";

export const dynamic = "force-dynamic";

// PATCH — עדכון חוזה קיים.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const parsed = await parseBody(request, updateCustomContractSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;

    const existing = await prisma.customContract.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ message: "חוזה לא נמצא" }, { status: 404 });
    }

    const newStart = body.startDate ? new Date(body.startDate) : existing.startDate;
    const newEnd = body.endDate ? new Date(body.endDate) : existing.endDate;
    if ((body.startDate || body.endDate) && newEnd <= newStart) {
      return NextResponse.json(
        { message: "תאריכים לא תקינים — סיום חייב להיות אחרי תחילה" },
        { status: 400 }
      );
    }

    const contract = await withAudit(
      { kind: "user", session },
      {
        action: "update_custom_contract",
        targetType: "CustomContract",
        targetId: id,
        details: { changes: Object.keys(body) },
      },
      async (tx) => {
        return tx.customContract.update({
          where: { id },
          data: {
            ...(body.monthlyEquivPriceIls !== undefined && {
              monthlyEquivPriceIls: body.monthlyEquivPriceIls,
            }),
            ...(body.billingCycleMonths !== undefined && {
              billingCycleMonths: body.billingCycleMonths,
            }),
            ...(body.customSmsQuota !== undefined && { customSmsQuota: body.customSmsQuota }),
            ...(body.customAiTier !== undefined && { customAiTier: body.customAiTier }),
            ...(body.startDate !== undefined && { startDate: new Date(body.startDate) }),
            ...(body.endDate !== undefined && { endDate: new Date(body.endDate) }),
            ...(body.autoRenew !== undefined && { autoRenew: Boolean(body.autoRenew) }),
            ...(body.renewalMonths !== undefined && { renewalMonths: body.renewalMonths }),
            ...(body.annualIncreasePct !== undefined && {
              annualIncreasePct: body.annualIncreasePct,
            }),
            ...(body.signedDocumentUrl !== undefined && {
              signedDocumentUrl: body.signedDocumentUrl?.trim() || null,
            }),
            ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
          },
        });
      }
    );

    return NextResponse.json(JSON.parse(JSON.stringify(contract)));
  } catch (error) {
    logger.error("[admin/custom-contracts/[id]] PATCH error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון החוזה" },
      { status: 500 }
    );
  }
}

// DELETE — מחיקת חוזה. אחרי המחיקה הקליניקה חוזרת לתמחור לפי ה-plan.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const existing = await prisma.customContract.findUnique({
      where: { id },
      include: { organization: { select: { id: true, name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ message: "חוזה לא נמצא" }, { status: 404 });
    }

    await withAudit(
      { kind: "user", session },
      {
        action: "delete_custom_contract",
        targetType: "CustomContract",
        targetId: id,
        details: {
          organizationId: existing.organizationId,
          orgName: existing.organization.name,
          monthlyEquivPriceIls: Number(existing.monthlyEquivPriceIls),
        },
      },
      async (tx) => tx.customContract.delete({ where: { id } })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[admin/custom-contracts/[id]] DELETE error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת החוזה" },
      { status: 500 }
    );
  }
}
