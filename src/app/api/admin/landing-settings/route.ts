// src/app/api/admin/landing-settings/route.ts
// GET + POST להגדרות התצוגה של דף הנחיתה הציבורי: מחיר מסלול "מטפל פרטי",
// טקסט מבצע, ומתג ניראות. מאוחסן ב-SiteSetting (תצוגה שיווקית בלבד, מנותק
// מהחיוב בפועל). מוגן ב-requirePermission כמו שאר הגדרות החיוב.

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { getSiteSettings } from "@/lib/site-settings";
import type { SiteSettingKey } from "@/lib/cardcom/types";
import { parseBody } from "@/lib/validations/helpers";
import { updateLandingSettingsSchema } from "@/lib/validations/admin";

export const dynamic = "force-dynamic";

const LANDING_KEYS = [
  "landing_private_price",
  "landing_price_note",
  "landing_price_visible",
] as const;

function readLanding(s: Partial<Record<(typeof LANDING_KEYS)[number], unknown>>) {
  return {
    privatePrice: (s.landing_private_price as string | undefined) ?? "",
    priceNote: (s.landing_price_note as string | undefined) ?? "",
    priceVisible: (s.landing_price_visible as boolean | undefined) ?? false,
  };
}

export async function GET() {
  const auth = await requirePermission("settings.billing_provider");
  if ("error" in auth) return auth.error;

  try {
    const s = await getSiteSettings(LANDING_KEYS);
    return NextResponse.json(readLanding(s));
  } catch (err) {
    logger.error("[admin/landing-settings GET] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת הגדרות דף הנחיתה" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.billing_provider");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const parsed = await parseBody(request, updateLandingSettingsSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  const updates: Array<[SiteSettingKey, unknown]> = [];
  if (body.privatePrice !== undefined) updates.push(["landing_private_price", body.privatePrice]);
  if (body.priceNote !== undefined) updates.push(["landing_price_note", body.priceNote]);
  if (body.priceVisible !== undefined) updates.push(["landing_price_visible", body.priceVisible]);

  if (updates.length === 0) {
    return NextResponse.json({ message: "אין שדות לעדכון" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await Promise.all(
        updates.map(([key, value]) =>
          tx.siteSetting.upsert({
            where: { key },
            create: { key, value: value as Prisma.InputJsonValue, updatedById: session.user.id },
            update: { value: value as Prisma.InputJsonValue, updatedById: session.user.id },
          })
        )
      );
    });

    const s = await getSiteSettings(LANDING_KEYS);
    return NextResponse.json(readLanding(s));
  } catch (err) {
    logger.error("[admin/landing-settings POST] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאה בשמירת הגדרות דף הנחיתה" },
      { status: 500 }
    );
  }
}
