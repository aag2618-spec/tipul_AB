// src/app/api/admin/business-settings/route.ts
// GET + POST for the global ADMIN business profile (used to issue receipts).
// Sensitive switch (EXEMPT ↔ LICENSED) is wrapped in withAudit.

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { getAdminBusinessProfile } from "@/lib/site-settings";
import type { SiteSettingKey } from "@/lib/cardcom/types";
import { parseBody } from "@/lib/validations/helpers";
import { updateAdminBusinessSettingsSchema } from "@/lib/validations/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("settings.billing_provider");
  if ("error" in auth) return auth.error;

  try {
    const profile = await getAdminBusinessProfile();
    return NextResponse.json(profile);
  } catch (err) {
    logger.error("[admin/business-settings GET] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת הגדרות העסק" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.billing_provider");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const parsed = await parseBody(request, updateAdminBusinessSettingsSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  // עדכוני type/vat נחשבים רגישים → withAudit. עדכוני קישורי-טקסט (logo/footer) עדינים יותר.
  const isSensitiveChange = body.type !== undefined || body.vatRate !== undefined;

  const previousProfile = await getAdminBusinessProfile();

  const updates: Array<[SiteSettingKey, unknown]> = [];
  if (body.type !== undefined) updates.push(["admin_business_type", body.type]);
  if (body.name !== undefined) updates.push(["admin_business_name", body.name]);
  if (body.idNumber !== undefined) updates.push(["admin_business_id_number", body.idNumber]);
  if (body.address !== undefined) updates.push(["admin_business_address", body.address]);
  if (body.phone !== undefined) updates.push(["admin_business_phone", body.phone]);
  if (body.email !== undefined) updates.push(["admin_business_email", body.email]);
  if (body.vatRate !== undefined) updates.push(["admin_business_vat_rate", body.vatRate]);
  if (body.logoUrl !== undefined) updates.push(["admin_business_logo_url", body.logoUrl]);
  if (body.footerText !== undefined) updates.push(["admin_business_footer_text", body.footerText]);

  if (updates.length === 0) {
    return NextResponse.json({ message: "אין שדות לעדכון" }, { status: 400 });
  }

  try {
    const upsertAll = async (tx: Prisma.TransactionClient) => {
      // batch all upserts in a single transaction (avoid N+1 round-trips)
      await Promise.all(
        updates.map(([key, value]) =>
          tx.siteSetting.upsert({
            where: { key },
            create: { key, value: value as Prisma.InputJsonValue, updatedById: session.user.id },
            update: { value: value as Prisma.InputJsonValue, updatedById: session.user.id },
          })
        )
      );
    };

    if (isSensitiveChange) {
      await withAudit(
        { kind: "user", session },
        {
          action: "update_admin_business_settings",
          targetType: "site_setting",
          targetId: "admin_business_profile",
          details: {
            previous: previousProfile,
            updates: Object.fromEntries(updates),
          },
        },
        async (tx) => {
          await upsertAll(tx);
        }
      );
    } else {
      await prisma.$transaction(async (tx) => {
        await upsertAll(tx);
      });
    }

    const profile = await getAdminBusinessProfile();
    return NextResponse.json(profile);
  } catch (err) {
    logger.error("[admin/business-settings POST] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאה בשמירת הגדרות העסק" },
      { status: 500 }
    );
  }
}
