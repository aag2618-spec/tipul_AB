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

export const dynamic = "force-dynamic";

interface BusinessSettingsBody {
  type?: "EXEMPT" | "LICENSED";
  name?: string;
  idNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  vatRate?: number;
  logoUrl?: string | null;
  footerText?: string | null;
}

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

  let body: BusinessSettingsBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }

  // ולידציה
  if (body.type && body.type !== "EXEMPT" && body.type !== "LICENSED") {
    return NextResponse.json(
      { message: "סוג עסק לא חוקי — חייב להיות EXEMPT או LICENSED" },
      { status: 400 }
    );
  }
  if (body.vatRate !== undefined && (body.vatRate < 0 || body.vatRate > 100)) {
    return NextResponse.json(
      { message: "אחוז מע\"מ חייב להיות בין 0 ל-100" },
      { status: 400 }
    );
  }
  if (body.email !== undefined && body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ message: "כתובת מייל לא תקינה" }, { status: 400 });
  }

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
